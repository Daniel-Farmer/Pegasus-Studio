// ============================================================
// EDITOR-MAIN — Bootstrap, render loop, keyboard shortcuts
// ============================================================

(function() {
  'use strict';

  var scene, sceneData;
  var animFrameId = null;

  function boot() {
    // Check if we're on a project URL: /projects/:uid
    var pathMatch = window.location.pathname.match(/^\/projects\/([a-f0-9-]+)$/);
    if (pathMatch) {
      var uid = pathMatch[1];
      window._projectUID = uid;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/projects/' + uid + '/scene', true);
      xhr.onload = function() {
        if (xhr.status === 401) { window.location.href = '/login'; return; }
        if (xhr.status === 403 || xhr.status === 404) { window.location.href = '/dashboard'; return; }
        try {
          var data = JSON.parse(xhr.responseText);
          sceneData = data;
          initEditor(data);
        } catch(e) {
          sceneData = defaultSceneData();
          initEditor(sceneData);
        }
      };
      xhr.onerror = function() {
        sceneData = defaultSceneData();
        initEditor(sceneData);
      };
      xhr.send();
    } else {
      // Fallback: load scene.json directly (backward compat / direct editor.html)
      SceneLoader.load('scene.json', function(err, data) {
        if (err || !data) {
          data = defaultSceneData();
        }
        sceneData = data;
        initEditor(data);
      });
    }
  }

  function initEditor(data) {
    scene = new THREE.Scene();

    var canvas = document.getElementById('editor-canvas');
    var vp = EditorViewport.init(scene, canvas);

    EditorQuad.init(vp.renderer, vp.camera, canvas);
    EditorPanels.init(rebuildObject);

    // Minimal fallback lighting (scenes define their own via light behaviors)
    scene.add(new THREE.AmbientLight(0x888888, 0.5));
    var dirLight = new THREE.DirectionalLight(0xFFEEDD, 1.0);
    dirLight.position.set(30, 20, 30);
    scene.add(dirLight);

    // Skybox — read from scene data or default to clearDay
    EditorSkybox.init(scene);
    EditorSkybox.apply((data.world && data.world.sky) || 'sunset');

    EditorGrid.init(scene, 1);

    if (typeof EditorDraw !== 'undefined') {
      EditorDraw.init(scene);
      EditorDraw.onCommit(function(ids) {
        EditorPalette.refreshHierarchy();
        EditorIO.triggerSave();
        if (ids.length > 0) EditorViewport.selectObject(ids[ids.length - 1]);
      });
    }

    if (typeof EditorSculpt !== 'undefined') {
      EditorSculpt.init(scene);
      EditorSculpt.onCommit(function() {
        EditorIO.triggerSave();
      });
    }

    if (typeof EditorRoad !== 'undefined') {
      EditorRoad.init(scene);
      EditorRoad.onCommit(function(ids) {
        EditorPalette.refreshHierarchy();
        EditorIO.triggerSave();
        if (ids.length > 0) EditorViewport.selectObject(ids[ids.length - 1]);
      });
    }

    Engine.init(scene, data);
    Engine.registerDefaultBuilders();
    Engine.buildAllEditor();

    EditorGizmo.init(scene, vp.camera, canvas);
    EditorPanel.init();
    EditorConsole.init();
    EditorLayout.init();
    EditorPalette.init();
    EditorPalette.refreshHierarchy();

    if (typeof EditorPrefab !== 'undefined') EditorPrefab.init();
    if (typeof EditorTextures !== 'undefined') EditorTextures.init();
    if (typeof EditorAssets !== 'undefined') EditorAssets.init();

    if (typeof EditorProject !== 'undefined') {
      EditorProject.init();
      EditorProject.onSwitch(function(newData, sceneName) {
        loadSceneData(newData);
        updateStatus('Switched to: ' + sceneName);
      });
    }

    EditorIO.init(data);
    EditorIO.startAutosave();

    // --- Wire up callbacks ---
    var lastSelectedId = null;
    EditorViewport.onSelect(function(id) {
      // Re-clicking same object toggles between move/resize gizmo
      if (id && id === lastSelectedId) {
        var newMode = EditorGizmo.toggleMode();
        updateStatus(newMode === 'resize' ? 'Resize mode' : 'Move mode');
        EditorPanel.showProperties(id);
        lastSelectedId = id;
        return;
      }
      lastSelectedId = id;
      EditorGizmo.setMode('move');
      EditorPanel.showProperties(id);
      EditorGizmo.attachTo(id);
      EditorPanels.updateSelection(id);
      updateStatusSelection(id);
    });

    EditorViewport.onMultiSelect(function(ids) {
      // Update hierarchy to highlight all selected
      EditorPalette.highlightHierarchyMulti(ids);
      // Update status with count
      updateStatusSelection(null, ids);
    });

    EditorPanel.onChange(function(id, type, key, oldVal, newVal) {
      var cmd = EditorHistory.propertyCommand(id, type, key, oldVal, newVal, rebuildObject);
      EditorHistory.push(cmd);
      rebuildObject(id, type);
      EditorPalette.refreshHierarchy();
    });

    EditorGizmo.onMove(function(id, oldX, oldY, oldZ, newX, newY, newZ) {
      var entry = Engine.getEntry(id);
      if (!entry) return;
      // Auto-snap in top-down mode regardless of snap toggle
      if (typeof EditorQuad !== 'undefined' && EditorQuad.getViewMode() === 'topdown') {
        var gs = EditorGrid.getSize();
        newX = Math.round(newX / gs) * gs;
        newZ = Math.round(newZ / gs) * gs;
      }
      entry.data.x = newX;
      entry.data.y = newY;
      entry.data.z = newZ;
      var type = entry.data.primitive || 'box';
      rebuildObject(id, type);
      EditorGizmo.attachTo(id);
      EditorPanel.refresh();
      EditorIO.triggerSave();
    });

    EditorGizmo.onRotate(function(id, axis, oldRot, newRot) {
      var entry = Engine.getEntry(id);
      if (!entry) return;
      var rotKey = 'rot' + axis.toUpperCase();
      var cmd = EditorHistory.propertyCommand(id, entry.data.primitive || 'box', rotKey, oldRot, newRot, rebuildObject);
      entry.data[rotKey] = newRot;
      EditorHistory.push(cmd);
      rebuildObject(id, entry.data.primitive || 'box');
      EditorGizmo.attachTo(id);
      EditorPanel.refresh();
    });

    EditorGizmo.onResize(function(id) {
      var entry = Engine.getEntry(id);
      if (!entry) return;
      rebuildObject(id, entry.data.primitive || 'box');
      EditorGizmo.attachTo(id);
      EditorPanel.refresh();
      EditorIO.triggerSave();
    });

    EditorPalette.onPlace(function(type, data) {
      var id = Engine.addObject(type, data);
      EditorPalette.refreshHierarchy();
      EditorPalette.clearPlacement();
      if (id) EditorViewport.selectObject(id);
      EditorIO.triggerSave();
      return id;
    });

    setupMenuBar();
    setupToolStrip();
    document.addEventListener('keydown', onKeyDown);

    canvas.addEventListener('click', function(e) {
      // Skip palette placement when draw/sculpt/road tool is active
      if (typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) return;
      if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) return;
      if (typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) return;
      var placement = EditorPalette.getPlacementMode();
      if (placement) {
        var pos = EditorViewport.getCursorWorldPos();
        if (pos) EditorPalette.placeAt(pos.x, pos.z);
      }
    });

    // --- Canvas drag-and-drop (asset library + filesystem) ---
    canvas.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', function(e) {
      e.preventDefault();
      // Check for internal asset data from the asset library
      var assetData = e.dataTransfer.getData('application/x-asset');
      if (assetData) {
        try {
          var asset = JSON.parse(assetData);
          var worldPos = EditorViewport.screenToWorld(e.clientX, e.clientY);
          if (worldPos) {
            Engine.addObject('empty', {
              x: EditorGrid.snap(worldPos.x), y: 0, z: EditorGrid.snap(worldPos.z),
              tag: asset.name,
              behaviors: [{ type: 'model', url: asset.file, scale: 1, castShadow: true }]
            });
            EditorPalette.refreshHierarchy();
            EditorIO.triggerSave();
          }
        } catch(err) {
          console.error('[Drop] Failed to parse asset data:', err);
        }
        return;
      }

      // Check for filesystem files (.glb/.gltf)
      handleFileDrop(e.dataTransfer.files, e.clientX, e.clientY);
    });

    function handleFileDrop(files, screenX, screenY) {
      if (!files || files.length === 0) return;
      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'glb' && ext !== 'gltf') continue;
        uploadAndPlaceModel(file, screenX, screenY);
      }
    }

    function uploadAndPlaceModel(file, screenX, screenY) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-model', true);
      xhr.setRequestHeader('X-Filename', file.name);
      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText);
            var worldPos = EditorViewport.screenToWorld(screenX, screenY);
            if (worldPos) {
              Engine.addObject('empty', {
                x: EditorGrid.snap(worldPos.x), y: 0, z: EditorGrid.snap(worldPos.z),
                tag: resp.name.replace(/\.[^.]+$/, ''),
                behaviors: [{ type: 'model', url: resp.url, scale: 1, castShadow: true }]
              });
              EditorPalette.refreshHierarchy();
              EditorIO.triggerSave();
              updateStatus('Model placed: ' + resp.name);
            }
          } catch(err) {
            console.error('[Upload] Failed to parse response:', err);
          }
        } else {
          console.error('[Upload] Failed:', xhr.responseText);
          updateStatus('Upload failed: ' + xhr.status);
        }
      };
      xhr.send(file);
    }

    // PiP border click — swap views
    var pipBorder = document.getElementById('pip-border');
    if (pipBorder) {
      pipBorder.addEventListener('click', function(e) {
        e.stopPropagation();
        var mode = EditorQuad.toggleViewMode();
        updateStatus(mode === 'topdown' ? 'Top-Down view' : '3D view');
        EditorViewport.updateStatusHint();
        var tdBtn = document.querySelector('.tool-btn[data-tool="topdown"]');
        if (tdBtn) tdBtn.classList.toggle('active', mode === 'topdown');
        // Deactivate draw tools when switching to 3D (sculpt works in both)
        if (mode !== 'topdown' && typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
          EditorDraw.setTool(null);
          setActiveTool('move');
        }
      });
    }

    if (typeof EditorStats !== 'undefined') EditorStats.init();
    if (typeof EditorCompass !== 'undefined') EditorCompass.init();
    if (typeof EditorPlaytest !== 'undefined') EditorPlaytest.init(scene);
    animate();
    console.log('[Editor] Initialized');
  }

  function rebuildObject(id, type) {
    Engine.updateObject(id, {});
  }

  // ---- Menu Bar ----

  var openMenu = null;

  function closeMenus() {
    var items = document.querySelectorAll('.menu-item.open');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('open');
    openMenu = null;
  }

  function toggleMenu(item) {
    if (item.classList.contains('open')) {
      closeMenus();
    } else {
      closeMenus();
      item.classList.add('open');
      openMenu = item;
    }
  }

  function setupMenuBar() {
    var menuItems = document.querySelectorAll('.menu-item');

    // Click on top-level label → toggle dropdown
    for (var i = 0; i < menuItems.length; i++) {
      (function(mi) {
        mi.querySelector('.menu-label').addEventListener('mousedown', function(e) {
          e.preventDefault();
          e.stopPropagation();
          toggleMenu(mi);
        });
        // Hover-switch: if another menu is open, switch to this one
        mi.addEventListener('mouseenter', function() {
          if (openMenu && openMenu !== mi) {
            closeMenus();
            mi.classList.add('open');
            openMenu = mi;
          }
        });
      })(menuItems[i]);
    }

    // Click outside closes menus
    document.addEventListener('mousedown', function(e) {
      if (openMenu && !openMenu.contains(e.target)) closeMenus();
    });

    // Wire up menu entry actions
    var actions = {
      'new': function() {
        if (typeof EditorProject !== 'undefined') {
          EditorProject.showNewSceneDialog();
        } else {
          if (!confirm('Create a new blank scene? Unsaved changes will be lost.')) return;
          newScene();
        }
      },
      'load': function() {
        EditorIO.loadFile(function(err, data) {
          if (!err && data) {
            loadSceneData(data);
            updateStatus('Scene loaded');
          }
        });
      },
      'save': function() { EditorIO.saveFile(); },
      'save-server': function() {
        EditorIO.saveServer(function(err) {
          if (err) alert('Save failed: ' + err.message);
          else {
            updateStatus('Saved to server');
            EditorPanels.refreshBackups();
          }
        });
      },
      'export': function() {
        updateStatus('Exporting...');
        EditorIO.exportHTML(function(err, size) {
          if (err) updateStatus('Export failed');
          else updateStatus('Exported (' + Math.round(size / 1024) + ' KB)');
        });
      },
      'scenes': function() {
        if (typeof EditorProject !== 'undefined') EditorProject.showModal();
      },
      'undo': function() {
        EditorHistory.undo();
        afterUndoRedo();
      },
      'redo': function() {
        EditorHistory.redo();
        afterUndoRedo();
      },
      'duplicate': function() { duplicateSelected(); },
      'delete': function() { deleteSelected(); },
      'select-all': function() {
        var entries = Engine.getAllEntries();
        var ids = [];
        for (var eid in entries) ids.push(eid);
        ids.sort();
        if (ids.length > 0) {
          EditorViewport.selectMultiple(ids);
          updateStatus('Selected all (' + ids.length + ' objects)');
        }
      },
      'deselect': function() { deselectAll(); },
      'world-settings': function() { EditorPanel.showWorldSettings(); },
      'toggle-grid': function() {
        var vis = EditorGrid.toggleVisible();
        updateStatus(vis ? 'Grid visible' : 'Grid hidden');
      },
      'toggle-stats': function() {
        if (typeof EditorStats !== 'undefined') EditorStats.toggle();
      },
      'toggle-topdown': function() {
        if (typeof EditorQuad !== 'undefined') {
          var mode = EditorQuad.toggleViewMode();
          updateStatus(mode === 'topdown' ? 'Top-Down view' : '3D view');
          EditorViewport.updateStatusHint();
          var btn = document.querySelector('.tool-btn[data-tool="topdown"]');
          if (btn) btn.classList.toggle('active', mode === 'topdown');
        }
      },
      'focus': function() { focusSelected(); },
      'test': function() {
        if (typeof EditorPlaytest !== 'undefined') EditorPlaytest.toggle();
        else EditorIO.testInGame();
      }
    };

    var entries = document.querySelectorAll('.menu-entry[data-action]');
    for (var j = 0; j < entries.length; j++) {
      (function(entry) {
        entry.addEventListener('click', function(e) {
          e.stopPropagation();
          var action = entry.getAttribute('data-action');
          if (actions[action]) actions[action]();
          closeMenus();
        });
      })(entries[j]);
    }

    // Inline controls (Tools menu) — stop propagation so clicking doesn't close
    var inlineEntries = document.querySelectorAll('.menu-entry-inline');
    for (var k = 0; k < inlineEntries.length; k++) {
      inlineEntries[k].addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Grid size input
    var gridInput = document.getElementById('grid-size');
    if (gridInput) gridInput.addEventListener('change', function() {
      EditorGrid.setSize(parseFloat(this.value) || 1);
    });

    // Snap toggle
    var snapCheck = document.getElementById('snap-toggle');
    if (snapCheck) snapCheck.addEventListener('change', function() {
      EditorGrid.setSnapEnabled(this.checked);
    });

    // Play button
    var playBtn = document.getElementById('play-toggle');
    if (playBtn && typeof EditorPlaytest !== 'undefined') {
      playBtn.addEventListener('click', function() { EditorPlaytest.toggle(); });
    }
  }

  // ---- Tool Strip ----

  var activeTool = 'move';
  var toolActions = null; // hoisted, populated in setupToolStrip

  function activateDrawTool(drawType) {
    if (typeof EditorDraw === 'undefined') return;
    if (typeof EditorRoad !== 'undefined') EditorRoad.setTool(null);
    // Auto-switch to top-down if not already
    if (typeof EditorQuad !== 'undefined' && EditorQuad.getViewMode() !== 'topdown') {
      EditorQuad.toggleViewMode();
      var tdBtn = document.querySelector('.tool-btn[data-tool="topdown"]');
      if (tdBtn) tdBtn.classList.add('active');
    }
    EditorDraw.setTool(drawType);
    setActiveTool('draw-' + drawType);
    updateStatus('Draw: ' + drawType.charAt(0).toUpperCase() + drawType.slice(1));
    EditorViewport.updateStatusHint();
  }

  function activateSculptTool(sculptType) {
    if (typeof EditorSculpt === 'undefined') return;
    // Deactivate draw tools
    if (typeof EditorDraw !== 'undefined') EditorDraw.setTool(null);
    if (typeof EditorRoad !== 'undefined') EditorRoad.setTool(null);
    EditorSculpt.setTool(sculptType);
    setActiveTool('sculpt-' + sculptType);
    syncSculptSliders();
    updateStatus('Sculpt: ' + sculptType.charAt(0).toUpperCase() + sculptType.slice(1));
    EditorViewport.updateStatusHint();
  }

  function activateRoadTool() {
    if (typeof EditorRoad === 'undefined') return;
    // Deactivate draw + sculpt tools
    if (typeof EditorDraw !== 'undefined') EditorDraw.setTool(null);
    if (typeof EditorSculpt !== 'undefined') EditorSculpt.setTool(null);
    var styleEl = document.getElementById('road-style');
    var style = styleEl ? styleEl.value : 'dirt';
    // Sync width and pavements to style defaults
    var styles = (typeof BuilderSingle !== 'undefined') ? BuilderSingle.ROAD_STYLES : null;
    if (styles && styles[style]) {
      if (styles[style].defaultWidth) {
        var dw = styles[style].defaultWidth;
        EditorRoad.setWidth(dw);
        var ws = document.getElementById('road-width');
        var wv = document.getElementById('road-width-val');
        if (ws) ws.value = dw;
        if (wv) wv.textContent = dw;
      }
      var paveCheck = document.getElementById('road-pavements');
      var dp = !!styles[style].defaultPavements;
      EditorRoad.setPavements(dp);
      if (paveCheck) paveCheck.checked = dp;
    }
    EditorRoad.setTool(style);
    setActiveTool('road');
    updateStatus('Road: ' + style.charAt(0).toUpperCase() + style.slice(1));
    EditorViewport.updateStatusHint();
  }

  function syncSculptSliders() {
    if (typeof EditorSculpt === 'undefined') return;
    var rs = document.getElementById('sculpt-radius');
    var rv = document.getElementById('sculpt-radius-val');
    var ss = document.getElementById('sculpt-strength');
    var sv = document.getElementById('sculpt-strength-val');
    if (rs) { rs.value = EditorSculpt.getBrushRadius(); }
    if (rv) { rv.textContent = EditorSculpt.getBrushRadius(); }
    if (ss) { ss.value = Math.round(EditorSculpt.getBrushStrength() * 100); }
    if (sv) { sv.textContent = Math.round(EditorSculpt.getBrushStrength() * 100) + '%'; }
  }

  function setActiveTool(name) {
    activeTool = name;
    // Deactivate draw tool when switching to a non-draw tool
    if (name.indexOf('draw-') !== 0 && typeof EditorDraw !== 'undefined') {
      EditorDraw.setTool(null);
    }
    // Deactivate sculpt tool when switching to a non-sculpt tool
    if (name.indexOf('sculpt-') !== 0 && typeof EditorSculpt !== 'undefined') {
      EditorSculpt.setTool(null);
    }
    // Deactivate road tool when switching to a non-road tool
    if (name !== 'road' && typeof EditorRoad !== 'undefined') {
      EditorRoad.setTool(null);
    }
    // Show/hide sculpt options bar
    var sculptOpts = document.getElementById('sculpt-opts');
    if (sculptOpts) sculptOpts.style.display = (name.indexOf('sculpt-') === 0) ? 'flex' : 'none';
    // Show/hide road options bar
    var roadOpts = document.getElementById('road-opts');
    if (roadOpts) roadOpts.style.display = (name === 'road') ? 'flex' : 'none';
    // Deactivate select tool when switching to a non-select tool
    EditorViewport.setSelectToolActive(name === 'select');
    var btns = document.querySelectorAll('#toolbar-tools .tool-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === name);
    }
    EditorViewport.updateStatusHint();
  }

  function setupToolStrip() {
    toolActions = {
      'select': function() {
        setActiveTool('select');
        EditorViewport.setSelectToolActive(true);
        updateStatus('Select mode');
      },
      'move': function() {
        EditorGizmo.setMode('move');
        setActiveTool('move');
        updateStatus('Move mode');
      },
      'rotate': function() {
        // Rotate is part of move mode — the gizmo shows a rotate ring in move mode
        EditorGizmo.setMode('move');
        setActiveTool('rotate');
        updateStatus('Rotate mode');
      },
      'scale': function() {
        EditorGizmo.setMode('resize');
        setActiveTool('scale');
        updateStatus('Scale mode');
      },
      'paint': function() {
        var id = EditorViewport.getSelectedId();
        if (!id) { updateStatus('Select an object first'); return; }
        var entry = Engine.getEntry(id);
        if (!entry || !entry.data) return;
        // Open a colour picker for the selected object's "all" face
        var faces = entry.data.faces || {};
        var allFace = faces.all || {};
        var currentColor = allFace.color || '0xCCCCCC';
        var hex = '#' + String(currentColor).replace(/^0x/, '');
        var picker = document.createElement('input');
        picker.type = 'color';
        picker.value = hex;
        picker.style.position = 'fixed';
        picker.style.top = '0';
        picker.style.left = '0';
        picker.style.opacity = '0';
        document.body.appendChild(picker);
        picker.addEventListener('input', function() {
          var newColor = '0x' + picker.value.replace('#', '').toUpperCase();
          if (!entry.data.faces) entry.data.faces = {};
          if (!entry.data.faces.all) entry.data.faces.all = {};
          entry.data.faces.all.color = newColor;
          rebuildObject(id, entry.data.primitive || 'box');
          EditorPanel.refresh();
        });
        picker.addEventListener('change', function() {
          document.body.removeChild(picker);
          updateStatus('Colour applied');
        });
        picker.click();
      },
      'texture': function() {
        if (typeof EditorTextures !== 'undefined') {
          EditorTextures.show();
          updateStatus('Texture browser');
        } else {
          updateStatus('Textures not available');
        }
      },
      'eyedropper': function() {
        var id = EditorViewport.getSelectedId();
        if (!id) { updateStatus('Select an object to sample'); return; }
        var entry = Engine.getEntry(id);
        if (!entry || !entry.data) return;
        var faces = entry.data.faces || {};
        var allFace = faces.all || {};
        var color = allFace.color || '0xCCCCCC';
        window._eyedropperColor = color;
        updateStatus('Copied colour: ' + color);
      },
      'duplicate': function() {
        duplicateSelected();
      },
      'delete': function() {
        deleteSelected();
      },
      'grid': function() {
        var vis = EditorGrid.toggleVisible();
        updateStatus(vis ? 'Grid visible' : 'Grid hidden');
        // Toggle active state
        var btn = document.querySelector('.tool-btn[data-tool="grid"]');
        if (btn) btn.classList.toggle('active', vis);
      },
      'snap': function() {
        var snapCheck = document.getElementById('snap-toggle');
        if (snapCheck) {
          snapCheck.checked = !snapCheck.checked;
          EditorGrid.setSnapEnabled(snapCheck.checked);
          updateStatus(snapCheck.checked ? 'Snap on' : 'Snap off');
          var btn = document.querySelector('.tool-btn[data-tool="snap"]');
          if (btn) btn.classList.toggle('active', snapCheck.checked);
        }
      },
      'topdown': function() {
        if (typeof EditorQuad !== 'undefined') {
          var mode = EditorQuad.toggleViewMode();
          updateStatus(mode === 'topdown' ? 'Top-Down view' : '3D view');
          EditorViewport.updateStatusHint();
          var btn = document.querySelector('.tool-btn[data-tool="topdown"]');
          if (btn) btn.classList.toggle('active', mode === 'topdown');
          // Deactivate draw tools when switching to 3D (sculpt works in both)
          if (mode !== 'topdown' && typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
            EditorDraw.setTool(null);
            setActiveTool('move');
          }
        }
      },
      'draw-wall': function() { activateDrawTool('wall'); },
      'draw-room': function() { activateDrawTool('room'); },
      'draw-floor': function() { activateDrawTool('floor'); },
      'draw-door': function() { activateDrawTool('door'); },
      'sculpt-raise': function() { activateSculptTool('raise'); },
      'sculpt-lower': function() { activateSculptTool('lower'); },
      'sculpt-smooth': function() { activateSculptTool('smooth'); },
      'sculpt-flatten': function() { activateSculptTool('flatten'); },
      'road': function() { activateRoadTool(); }
    };

    var btns = document.querySelectorAll('#toolbar-tools .tool-btn');
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var tool = btn.getAttribute('data-tool');
          if (toolActions[tool]) toolActions[tool]();
        });
      })(btns[i]);
    }

    // Set initial active states for toggles
    var gridBtn = document.querySelector('.tool-btn[data-tool="grid"]');
    if (gridBtn) gridBtn.classList.add('active');
    var snapBtn = document.querySelector('.tool-btn[data-tool="snap"]');
    if (snapBtn) snapBtn.classList.add('active');

    // Sculpt option sliders
    var sculptRadiusSlider = document.getElementById('sculpt-radius');
    var sculptRadiusVal = document.getElementById('sculpt-radius-val');
    var sculptStrengthSlider = document.getElementById('sculpt-strength');
    var sculptStrengthVal = document.getElementById('sculpt-strength-val');
    if (sculptRadiusSlider && typeof EditorSculpt !== 'undefined') {
      sculptRadiusSlider.value = EditorSculpt.getBrushRadius();
      sculptRadiusVal.textContent = EditorSculpt.getBrushRadius();
      sculptRadiusSlider.addEventListener('input', function() {
        var r = parseInt(this.value, 10);
        EditorSculpt.setBrushRadius(r);
        sculptRadiusVal.textContent = r;
      });
    }
    if (sculptStrengthSlider && typeof EditorSculpt !== 'undefined') {
      sculptStrengthSlider.value = Math.round(EditorSculpt.getBrushStrength() * 100);
      sculptStrengthVal.textContent = Math.round(EditorSculpt.getBrushStrength() * 100) + '%';
      sculptStrengthSlider.addEventListener('input', function() {
        var s = parseInt(this.value, 10);
        EditorSculpt.setBrushStrength(s / 100);
        sculptStrengthVal.textContent = s + '%';
      });
    }

    // Road option controls
    var roadStyleSel = document.getElementById('road-style');
    var roadWidthSlider = document.getElementById('road-width');
    var roadWidthVal = document.getElementById('road-width-val');
    if (roadStyleSel && typeof EditorRoad !== 'undefined') {
      roadStyleSel.addEventListener('change', function() {
        var style = this.value;
        EditorRoad.setStyle(style);
        // Auto-set width and pavements to style's real-world defaults
        var styles = (typeof BuilderSingle !== 'undefined') ? BuilderSingle.ROAD_STYLES : null;
        if (styles && styles[style]) {
          if (styles[style].defaultWidth) {
            var dw = styles[style].defaultWidth;
            EditorRoad.setWidth(dw);
            if (roadWidthSlider) roadWidthSlider.value = dw;
            if (roadWidthVal) roadWidthVal.textContent = dw;
          }
          var paveCheck = document.getElementById('road-pavements');
          var dp = !!styles[style].defaultPavements;
          EditorRoad.setPavements(dp);
          if (paveCheck) paveCheck.checked = dp;
        }
        updateStatus('Road style: ' + style);
      });
    }
    if (roadWidthSlider && typeof EditorRoad !== 'undefined') {
      roadWidthSlider.addEventListener('input', function() {
        var w = parseFloat(this.value);
        EditorRoad.setWidth(w);
        if (roadWidthVal) roadWidthVal.textContent = w;
      });
    }
    var roadPaveCheck = document.getElementById('road-pavements');
    if (roadPaveCheck && typeof EditorRoad !== 'undefined') {
      roadPaveCheck.addEventListener('change', function() {
        EditorRoad.setPavements(this.checked);
      });
    }

    // Palette tool activator callback for road
    window._activateRoadTool = function() { activateRoadTool(); };
  }

  function afterUndoRedo() {
    var id = EditorViewport.getSelectedId();
    if (id) {
      var entry = Engine.getEntry(id);
      if (entry) rebuildObject(id, entry.data.primitive || 'box');
    }
    EditorPanel.refresh();
    EditorPalette.refreshHierarchy();
  }

  function deselectAll() {
    EditorViewport.selectObject(null);
    EditorGizmo.detach();
    EditorPanel.showProperties(null);
    EditorPalette.highlightHierarchy(null);
    EditorPalette.clearPlacement();
  }

  function duplicateSelected() {
    var ids = EditorViewport.getSelectedIds();
    if (ids.length === 0) {
      var singleId = EditorViewport.getSelectedId();
      if (singleId) ids = [singleId];
    }
    if (ids.length === 0) return;

    var newIds = [];
    for (var di = 0; di < ids.length; di++) {
      var dupEntry = Engine.getEntry(ids[di]);
      if (dupEntry && dupEntry.data) {
        var cloneData = JSON.parse(JSON.stringify(dupEntry.data));
        var dupType = cloneData.primitive || 'box';
        delete cloneData.id;
        if (cloneData.x !== undefined) cloneData.x = (cloneData.x || 0) + 1;
        var newId = Engine.addObject(dupType, cloneData);
        if (newId) newIds.push(newId);
      }
    }
    if (newIds.length > 0) {
      EditorPalette.refreshHierarchy();
      if (newIds.length === 1) {
        EditorViewport.selectObject(newIds[0]);
        updateStatus('Duplicated \u2192 ' + newIds[0]);
      } else {
        EditorViewport.selectMultiple(newIds);
        updateStatus('Duplicated ' + newIds.length + ' objects');
      }
    }
  }

  function focusSelected() {
    var selId = EditorViewport.getSelectedId();
    if (selId) {
      var entry = Engine.getEntry(selId);
      if (entry && entry.data) {
        var d = entry.data;
        EditorViewport.focusOn(new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0));
      }
    }
  }

  function deleteSelected() {
    var ids = EditorViewport.getSelectedIds();
    if (ids.length === 0) {
      var singleId = EditorViewport.getSelectedId();
      if (singleId) ids = [singleId];
    }
    if (ids.length === 0) return;

    for (var di = 0; di < ids.length; di++) {
      Engine.unregister(ids[di]);
    }
    EditorViewport.selectObject(null);
    EditorGizmo.detach();
    EditorPanel.showProperties(null);
    EditorPalette.refreshHierarchy();
    updateStatus(ids.length === 1 ? 'Deleted ' + ids[0] : 'Deleted ' + ids.length + ' objects');
    EditorIO.triggerSave();
  }

  function nudgeSelected(id, key, shiftHeld) {
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    var d = entry.data;
    var step = EditorGrid.getSize();

    if (shiftHeld) {
      // Shift+arrows = Y axis
      if (key === 'ArrowUp') d.y = (d.y || 0) + step;
      else if (key === 'ArrowDown') d.y = (d.y || 0) - step;
    } else {
      // Arrows relative to camera view direction
      var yaw = EditorViewport.getCamYaw();
      var fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
      var rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);

      var dx = 0, dz = 0;
      if (key === 'ArrowUp')    { dx += fwdX; dz += fwdZ; }
      if (key === 'ArrowDown')  { dx -= fwdX; dz -= fwdZ; }
      if (key === 'ArrowLeft')  { dx -= rightX; dz -= rightZ; }
      if (key === 'ArrowRight') { dx += rightX; dz += rightZ; }

      // Snap the resulting position to grid
      d.x = EditorGrid.snap((d.x || 0) + dx * step);
      d.z = EditorGrid.snap((d.z || 0) + dz * step);
    }

    rebuildObject(id, d.primitive || 'box');
    EditorGizmo.attachTo(id);
    EditorPanel.refresh();
  }

  function clearScene() {
    var entries = Engine.getAllEntries();
    var ids = [];
    for (var id in entries) ids.push(id);
    for (var i = 0; i < ids.length; i++) Engine.unregister(ids[i]);
  }

  function loadSceneData(data) {
    clearScene();
    sceneData = data;
    Engine.init(scene, data);
    Engine.registerDefaultBuilders();
    SceneID.init(data);
    Engine.buildAllEditor();
    if (typeof EditorPalette !== 'undefined' && EditorPalette.loadFolders) {
      EditorPalette.loadFolders(data.folders || []);
    }
    EditorPalette.refreshHierarchy();
    EditorIO.init(data);
    EditorViewport.selectObject(null);
    EditorGizmo.detach();
    EditorPanel.showProperties(null);
    // Apply skybox from scene data
    if (typeof EditorSkybox !== 'undefined') {
      EditorSkybox.apply((data.world && data.world.sky) || 'sunset');
    }
  }

  function defaultSceneData() {
    var cx = 50, cz = 50;
    return {
      formatVersion: 2,
      title: 'Untitled',
      world: { width: 100, depth: 100, sky: 'sunset' },
      spawn: { x: cx, z: cz, rot: 0 },
      player: { eyeHeight: 1.6, walkSpeed: 4.0, sprintSpeed: 8.0, radius: 0.3, gravity: 15, jumpSpeed: 6 },
      colors: { fog: '0x9AB0C0' },
      objects: [
        // Baseplate
        { id: 'box_0', primitive: 'box', tag: 'Baseplate', x: cx, y: -0.1, z: cz, w: 100, h: 0.2, d: 100, rotX: 0, rotY: 0, rotZ: 0,
          faces: { all: { color: '0x7B8C7B', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
        // Spawn pad
        { id: 'box_1', primitive: 'box', tag: 'SpawnPad', x: cx, y: 0.1, z: cz, w: 4, h: 0.2, d: 4, rotX: 0, rotY: 0, rotZ: 0,
          faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
        // Spawn point (on top of pad)
        { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: cx, y: 0.2, z: cz, rotX: 0, rotY: 0, rotZ: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
        // Lights
        { id: 'emp_1', primitive: 'empty', tag: 'Ambient Light', x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0xFFFFFF', intensity: 0.4 }], scripts: [] },
        { id: 'emp_2', primitive: 'empty', tag: 'Sun', x: 30, y: 20, z: 30, rotX: 0, rotY: 0, rotZ: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'directional', color: '0xFFEEDD', intensity: 1.0, castShadow: true }], scripts: [] }
      ],
      prefabs: {},
      groups: [],
      folders: []
    };
  }

  function newScene() {
    var data = defaultSceneData();
    loadSceneData(data);
    updateStatus('New scene created');
  }

  function onKeyDown(e) {
    // Play mode: Escape stops play
    if (typeof EditorPlaytest !== 'undefined' && EditorPlaytest.isPlaying()) {
      if (e.key === 'Escape') {
        EditorPlaytest.stop();
        e.preventDefault();
      }
      return; // all other keys go to FPControls during play
    }

    // Close menus on Escape first
    if (e.key === 'Escape' && openMenu) {
      closeMenus();
      e.preventDefault();
      return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl+N — new scene
    if (e.ctrlKey && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      if (typeof EditorProject !== 'undefined') {
        EditorProject.showNewSceneDialog();
      } else {
        if (confirm('Create a new blank scene? Unsaved changes will be lost.')) newScene();
      }
      return;
    }
    // Ctrl+O — open/load
    if (e.ctrlKey && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      EditorIO.loadFile(function(err, data) {
        if (!err && data) {
          loadSceneData(data);
          updateStatus('Scene loaded');
        }
      });
      return;
    }
    // Ctrl+Shift+S — save to server
    if (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      EditorIO.saveServer(function(err) {
        if (err) alert('Save failed: ' + err.message);
        else {
          updateStatus('Saved to server');
          EditorPanels.refreshBackups();
        }
      });
      return;
    }
    // Ctrl+S — save (download)
    if (e.ctrlKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      EditorIO.saveFile();
      return;
    }
    // Ctrl+A — select all objects
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      var allEntries = Engine.getAllEntries();
      var allIds = [];
      for (var aid in allEntries) allIds.push(aid);
      allIds.sort();
      if (allIds.length > 0) {
        EditorViewport.selectMultiple(allIds);
        updateStatus('Selected all (' + allIds.length + ' objects)');
      }
      return;
    }

    // Enter — finalize road
    if (e.key === 'Enter' && typeof EditorRoad !== 'undefined' && EditorRoad.isDrawing()) {
      EditorRoad.onDoubleClick();
      e.preventDefault();
      return;
    }
    // Backspace — undo last road point (when drawing)
    if (e.key === 'Backspace' && typeof EditorRoad !== 'undefined' && EditorRoad.isDrawing()) {
      EditorRoad.onKeyDown(e);
      e.preventDefault();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
      e.preventDefault();
    }
    // Arrow keys — nudge selected object (Shift = Y axis)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var nudgeId = EditorViewport.getSelectedId();
      if (nudgeId) {
        nudgeSelected(nudgeId, e.key, e.shiftKey);
        e.preventDefault();
        return;
      }
    }
    if (e.ctrlKey && e.key === 'z') {
      EditorHistory.undo();
      afterUndoRedo();
      e.preventDefault();
    }
    if (e.ctrlKey && e.key === 'y') {
      EditorHistory.redo();
      afterUndoRedo();
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      // Cancel road tool first
      if (typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) {
        if (EditorRoad.isDrawing()) {
          EditorRoad.cancel();
          updateStatus('Road drawing cancelled');
        } else {
          EditorRoad.setTool(null);
          setActiveTool('move');
          updateStatus('Road tool deactivated');
        }
        EditorViewport.updateStatusHint();
        return;
      }
      // Cancel sculpt tool
      if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
        EditorSculpt.cancel();
        setActiveTool('move');
        updateStatus('Sculpt cancelled');
        EditorViewport.updateStatusHint();
        return;
      }
      // Cancel draw tool, then deselect
      if (typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
        EditorDraw.cancel();
        EditorDraw.setTool(null);
        setActiveTool('move');
        updateStatus('Draw cancelled');
        EditorViewport.updateStatusHint();
        return;
      }
      EditorPalette.hideContextMenu();
      deselectAll();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      var entries = Engine.getAllEntries();
      var ids = [];
      for (var eid in entries) ids.push(eid);
      ids.sort();
      if (ids.length > 0) {
        var curId = EditorViewport.getSelectedId();
        var curIdx = curId ? ids.indexOf(curId) : -1;
        var nextIdx;
        if (e.shiftKey) {
          nextIdx = curIdx <= 0 ? ids.length - 1 : curIdx - 1;
        } else {
          nextIdx = curIdx >= ids.length - 1 ? 0 : curIdx + 1;
        }
        EditorViewport.selectObject(ids[nextIdx]);
        EditorPalette.scrollToItem(ids[nextIdx]);
      }
    }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelected();
    }
    if (!e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      focusSelected();
    }
    // F2 — rename selected in hierarchy
    if (e.key === 'F2') {
      e.preventDefault();
      EditorPalette.renameSelected();
      return;
    }
    // H — toggle visibility of selected
    if (!e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
      EditorPalette.toggleVisibilitySelected();
      return;
    }
    // R — toggle move/resize gizmo
    if (!e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
      if (EditorViewport.getSelectedId()) {
        var newMode = EditorGizmo.toggleMode();
        updateStatus(newMode === 'resize' ? 'Resize mode' : 'Move mode');
      }
    }
    // Q — select tool
    if (!e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
      if (toolActions && toolActions['select']) toolActions['select']();
      return;
    }
    // G — toggle grid
    if (!e.ctrlKey && (e.key === 'g' || e.key === 'G')) {
      var vis = EditorGrid.toggleVisible();
      updateStatus(vis ? 'Grid visible' : 'Grid hidden');
    }
    // T — toggle top-down view
    if (!e.ctrlKey && (e.key === 't' || e.key === 'T')) {
      if (typeof EditorQuad !== 'undefined') {
        var tdMode = EditorQuad.toggleViewMode();
        updateStatus(tdMode === 'topdown' ? 'Top-Down view' : '3D view');
        EditorViewport.updateStatusHint();
        var tdBtn = document.querySelector('.tool-btn[data-tool="topdown"]');
        if (tdBtn) tdBtn.classList.toggle('active', tdMode === 'topdown');
        // Deactivate draw tools when switching to 3D (sculpt works in both)
        if (tdMode !== 'topdown' && typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
          EditorDraw.setTool(null);
          setActiveTool('move');
        }
      }
    }
    // 1/2/3/4 — draw tool shortcuts (top-down only)
    if (!e.ctrlKey && typeof EditorQuad !== 'undefined' && EditorQuad.getViewMode() === 'topdown') {
      if (e.key === '1') { activateDrawTool('wall'); e.preventDefault(); return; }
      if (e.key === '2') { activateDrawTool('room'); e.preventDefault(); return; }
      if (e.key === '3') { activateDrawTool('floor'); e.preventDefault(); return; }
      if (e.key === '4') { activateDrawTool('door'); e.preventDefault(); return; }
    }
    // 5/6/7/8 — sculpt tool shortcuts (any view)
    if (!e.ctrlKey) {
      if (e.key === '5') { activateSculptTool('raise'); e.preventDefault(); return; }
      if (e.key === '6') { activateSculptTool('lower'); e.preventDefault(); return; }
      if (e.key === '7') { activateSculptTool('smooth'); e.preventDefault(); return; }
      if (e.key === '8') { activateSculptTool('flatten'); e.preventDefault(); return; }
      // 9 — road tool
      if (e.key === '9') { activateRoadTool(); e.preventDefault(); return; }
      // [ ] — brush size
      if (e.key === '[' && typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
        EditorSculpt.setBrushRadius(EditorSculpt.getBrushRadius() - 1);
        syncSculptSliders();
        updateStatus('Brush: ' + EditorSculpt.getBrushRadius());
        e.preventDefault(); return;
      }
      if (e.key === ']' && typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
        EditorSculpt.setBrushRadius(EditorSculpt.getBrushRadius() + 1);
        syncSculptSliders();
        updateStatus('Brush: ' + EditorSculpt.getBrushRadius());
        e.preventDefault(); return;
      }
    }
    // F5 — play/stop
    if (e.key === 'F5') {
      e.preventDefault();
      if (typeof EditorPlaytest !== 'undefined') EditorPlaytest.toggle();
    }
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (typeof EditorPlaytest !== 'undefined' && EditorPlaytest.isPlaying()) {
      EditorPlaytest.renderFrame(EditorViewport.getRenderer());
    } else {
      EditorViewport.render();
      var inTopDown = typeof EditorQuad !== 'undefined' && EditorQuad.getViewMode() === 'topdown';
      // Skip compass in top-down (it's meaningless for ortho top-down)
      if (!inTopDown && typeof EditorCompass !== 'undefined') EditorCompass.render(EditorViewport.getRenderer());
      // Always render PiP preview
      if (typeof EditorQuad !== 'undefined') EditorQuad.renderPiP(EditorViewport.getRenderer(), scene);
      if (typeof EditorStats !== 'undefined') EditorStats.tick();
    }
  }

  function updateStatus(msg) {
    var el = document.getElementById('status-msg');
    if (el) el.textContent = msg;
  }

  function updateStatusSelection(id, ids) {
    var el = document.getElementById('status-selection');
    if (!el) return;
    if (ids && ids.length > 1) {
      el.textContent = 'Selected: ' + ids.length + ' objects';
    } else if (id) {
      el.textContent = 'Selected: ' + id;
    } else if (ids && ids.length === 1) {
      el.textContent = 'Selected: ' + ids[0];
    } else {
      el.textContent = 'No selection';
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
