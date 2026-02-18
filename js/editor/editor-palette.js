// ============================================================
// EDITOR-PALETTE — Primitive palette + preset placement + hierarchy
// ============================================================

var EditorPalette = (function() {
  'use strict';

  var placementMode = null;
  var onPlaceCallback = null;
  var hierarchyList = null;
  var paletteSection = null;
  var searchInput = null;
  var filterContainer = null;
  var expandedGroups = {};

  // Context menu state
  var ctxMenu = null;
  var ctxTargetId = null;

  // Rename state
  var renameId = null;
  var renameInput = null;
  var renameIsFolder = false;

  // Drag state
  var dragId = null;
  var dragIsFolder = false;
  var dragOverId = null;
  var dragOverIsFolder = false;
  var dragPos = null; // 'above', 'below', 'into'

  // Folder state
  var folders = [];
  var folderCounter = 0;

  // Eye icon SVGs
  var EYE_OPEN_SVG = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 9S4.5 4 9 4s7.5 5 7.5 5-3 5-7.5 5S1.5 9 1.5 9Z"/><circle cx="9" cy="9" r="2.2"/></svg>';
  var EYE_CLOSED_SVG = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5C3.5 10.5 6 12.5 9 12.5S14.5 10.5 16 7.5"/><path d="M5 12L3.5 14.5M9 13V15.5M13 12L14.5 14.5"/></svg>';

  // 9 primitive types
  var PRIMITIVES = [
    { type: 'box',      icon: '\u25A1', label: 'Box',       defaults: { w: 2, h: 2, d: 2 } },
    { type: 'cylinder', icon: '\u2296', label: 'Cylinder',   defaults: { radiusTop: 0.5, radiusBottom: 0.5, height: 2 } },
    { type: 'cone',     icon: '\u25B3', label: 'Cone',       defaults: { radiusBottom: 0.5, height: 2 } },
    { type: 'sphere',   icon: '\u25CB', label: 'Sphere',     defaults: { radius: 1 } },
    { type: 'torus',    icon: '\u25EF', label: 'Torus',      defaults: { radius: 1, tube: 0.3 } },
    { type: 'plane',    icon: '\u25AD', label: 'Plane',      defaults: { w: 4, h: 4, facing: 'up' } },
    { type: 'wedge',    icon: '\u25E5', label: 'Wedge',      defaults: { w: 2, h: 2, d: 4 } },
    { type: 'stairs',   icon: '\u2587', label: 'Stairs',     defaults: { w: 2, h: 2, d: 4, steps: 8 } },
    { type: 'terrain',  icon: '\u26F0', label: 'Terrain',    defaults: { width: 100, depth: 100, segments: 64 } },
    { type: 'road',     icon: '',       label: 'Road',       defaults: { width: 1.5, style: 'dirt' }, toolActivator: true },
    { type: 'empty',    icon: '\u2B1A', label: 'Empty',      defaults: {} }
  ];

  function init() {
    paletteSection = document.getElementById('palette-section');
    hierarchyList = document.getElementById('hierarchy-list');
    searchInput = document.getElementById('hierarchy-search');
    filterContainer = document.getElementById('hierarchy-filters');
    buildPaletteUI();
    initSearchAndFilter();
    createContextMenu();
    buildNewFolderButton();
  }

  // =================================================================
  // "+" NEW FOLDER BUTTON — added next to hierarchy header
  // =================================================================

  function buildNewFolderButton() {
    var section = document.getElementById('hierarchy-section');
    if (!section) return;
    var h3 = section.querySelector('h3');
    if (!h3) return;
    // Wrap h3 content in flex container
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    var textSpan = document.createElement('span');
    textSpan.textContent = h3.textContent;
    textSpan.style.flex = '1';
    h3.textContent = '';
    h3.appendChild(textSpan);

    var btn = document.createElement('button');
    btn.className = 'hierarchy-add-folder-btn';
    btn.title = 'New Folder';
    btn.textContent = '+';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      createFolder(null);
    });
    h3.appendChild(btn);
  }

  // =================================================================
  // FOLDER CRUD
  // =================================================================

  function createFolder(parentId) {
    var id = 'folder_' + folderCounter++;
    var folder = {
      id: id,
      name: 'New Folder',
      parentId: parentId || null,
      _order: folders.length,
      expanded: true
    };
    folders.push(folder);
    expandedGroups[id] = true;
    refreshHierarchy();
    // Start inline rename immediately
    startFolderRename(id);
    return id;
  }

  function deleteFolder(folderId) {
    // Move children (objects and sub-folders) to the deleted folder's parent
    var folder = getFolderById(folderId);
    var parentId = folder ? folder.parentId : null;

    // Move objects out
    var entries = Engine.getAllEntries();
    for (var oid in entries) {
      if (entries[oid].data.folderId === folderId) {
        entries[oid].data.folderId = parentId || undefined;
        if (!entries[oid].data.folderId) delete entries[oid].data.folderId;
      }
    }

    // Move sub-folders out
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].parentId === folderId) {
        folders[i].parentId = parentId || null;
      }
    }

    // Remove the folder itself
    for (var j = folders.length - 1; j >= 0; j--) {
      if (folders[j].id === folderId) {
        folders.splice(j, 1);
        break;
      }
    }
    delete expandedGroups[folderId];
    refreshHierarchy();
  }

  function renameFolder(folderId, newName) {
    var folder = getFolderById(folderId);
    if (folder) folder.name = newName;
  }

  function getFolderById(folderId) {
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === folderId) return folders[i];
    }
    return null;
  }

  function loadFolders(arr) {
    folders = arr ? JSON.parse(JSON.stringify(arr)) : [];
    // Recompute folderCounter from existing IDs
    folderCounter = 0;
    for (var i = 0; i < folders.length; i++) {
      var match = folders[i].id.match(/^folder_(\d+)$/);
      if (match) {
        var num = parseInt(match[1], 10) + 1;
        if (num > folderCounter) folderCounter = num;
      }
      // Restore expanded state
      if (folders[i].expanded !== false) {
        expandedGroups[folders[i].id] = true;
      }
    }
  }

  function getFolderData() {
    // Return folders with current expanded state
    var out = [];
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      out.push({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        _order: f._order,
        expanded: expandedGroups[f.id] !== false
      });
    }
    return out;
  }

  // =================================================================
  // PALETTE UI
  // =================================================================

  function buildPaletteUI() {
    if (!paletteSection) return;
    paletteSection.innerHTML = '<h3>Objects</h3>';

    // Primitives section — list layout with icon + label
    var primGroup = document.createElement('div');
    primGroup.className = 'palette-group';
    var primTitle = document.createElement('div');
    primTitle.className = 'palette-group-title';
    primTitle.textContent = 'Primitives';
    primGroup.appendChild(primTitle);

    var primList = document.createElement('div');
    primList.className = 'palette-list';
    for (var i = 0; i < PRIMITIVES.length; i++) {
      var item = PRIMITIVES[i];
      var row = document.createElement('div');
      row.className = 'palette-row';
      row.setAttribute('data-type', item.type);
      var iconSpan = document.createElement('span');
      iconSpan.className = 'palette-row-icon';
      iconSpan.innerHTML = EditorIcons.has(item.type) ? EditorIcons.get(item.type) : item.icon;
      row.appendChild(iconSpan);
      var labelSpan = document.createElement('span');
      labelSpan.className = 'palette-row-label';
      labelSpan.textContent = item.label;
      row.appendChild(labelSpan);
      (function(itm) {
        row.addEventListener('click', function() { togglePlacement(itm); });
      })(item);
      primList.appendChild(row);
    }
    primGroup.appendChild(primList);
    paletteSection.appendChild(primGroup);

    // Prefab section
    buildPrefabSection();

    // Asset library section (deferred — catalog may still be loading)
    buildAssetSection();
  }

  function buildPrefabSection() {
    if (!paletteSection) return;
    if (typeof EditorPrefab === 'undefined') return;

    var names = EditorPrefab.getNames();
    if (names.length === 0) return;

    var group = document.createElement('div');
    group.className = 'palette-group';
    var title = document.createElement('div');
    title.className = 'palette-group-title';
    title.textContent = 'Prefabs';
    group.appendChild(title);

    var prefabList = document.createElement('div');
    prefabList.className = 'palette-list';
    for (var pi = 0; pi < names.length; pi++) {
      var row = document.createElement('div');
      row.className = 'palette-row';
      row.setAttribute('data-type', 'prefab');
      row.setAttribute('data-prefab', names[pi]);
      var iconSpan = document.createElement('span');
      iconSpan.className = 'palette-row-icon';
      iconSpan.innerHTML = EditorIcons.get('prefab');
      row.appendChild(iconSpan);
      var labelSpan = document.createElement('span');
      labelSpan.className = 'palette-row-label';
      labelSpan.textContent = names[pi];
      row.appendChild(labelSpan);
      (function(prefabName) {
        row.addEventListener('click', function() {
          togglePlacement({ type: 'prefab', icon: '\u2B1A', label: prefabName, defaults: {}, prefabName: prefabName });
        });
        row.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          if (confirm('Delete prefab "' + prefabName + '"?')) {
            EditorPrefab.remove(prefabName);
            buildPaletteUI();
          }
        });
      })(names[pi]);
      prefabList.appendChild(row);
    }
    group.appendChild(prefabList);
    paletteSection.appendChild(group);
  }

  function buildAssetSection() {
    if (!paletteSection) return;
    if (typeof EditorAssets === 'undefined' || !EditorAssets.isLoaded()) return;

    var catalog = EditorAssets.getCatalog();
    var categories = EditorAssets.getCategories();
    if (!catalog || catalog.length === 0) return;

    var group = document.createElement('div');
    group.className = 'palette-group';
    var title = document.createElement('div');
    title.className = 'palette-group-title';
    title.textContent = 'Models (' + catalog.length + ')';
    group.appendChild(title);

    var assetList = document.createElement('div');
    assetList.className = 'palette-list';

    // One row per category — click opens modal filtered to that category
    for (var ci = 0; ci < categories.length; ci++) {
      var cat = categories[ci];
      var count = 0;
      for (var j = 0; j < catalog.length; j++) {
        if (catalog[j].category === cat) count++;
      }
      if (count === 0) continue;

      var row = document.createElement('div');
      row.className = 'palette-row';
      row.setAttribute('data-type', 'asset-category');
      var iconSpan = document.createElement('span');
      iconSpan.className = 'palette-row-icon';
      iconSpan.textContent = '\u25A6';
      row.appendChild(iconSpan);
      var labelSpan = document.createElement('span');
      labelSpan.className = 'palette-row-label';
      labelSpan.textContent = cat + ' (' + count + ')';
      row.appendChild(labelSpan);
      (function(category) {
        row.addEventListener('click', function() {
          if (typeof EditorAssets !== 'undefined') EditorAssets.show(category);
        });
      })(cat);
      assetList.appendChild(row);
    }

    // "Browse All..." row
    var browseRow = document.createElement('div');
    browseRow.className = 'palette-row';
    browseRow.style.color = '#5577aa';
    var browseIcon = document.createElement('span');
    browseIcon.className = 'palette-row-icon';
    browseIcon.textContent = '\u2026';
    browseRow.appendChild(browseIcon);
    var browseLabel = document.createElement('span');
    browseLabel.className = 'palette-row-label';
    browseLabel.textContent = 'Browse All...';
    browseRow.appendChild(browseLabel);
    browseRow.addEventListener('click', function() {
      if (typeof EditorAssets !== 'undefined') EditorAssets.show();
    });
    assetList.appendChild(browseRow);

    group.appendChild(assetList);
    paletteSection.appendChild(group);
  }

  function setPlacementMode(item) {
    var rows = paletteSection.querySelectorAll('.palette-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
    placementMode = item;
    // Find matching row
    for (var j = 0; j < rows.length; j++) {
      var lbl = rows[j].querySelector('.palette-row-label');
      if (lbl && lbl.textContent === item.label) {
        rows[j].classList.add('active');
        break;
      }
    }
  }

  function togglePlacement(item) {
    // Road tool activator — delegate to EditorRoad instead of placement mode
    if (item.toolActivator && typeof EditorRoad !== 'undefined') {
      placementMode = null;
      var rows = paletteSection.querySelectorAll('.palette-row');
      for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
      EditorRoad.setTool(item.defaults.style || 'dirt');
      // Notify editor-main to activate road tool UI
      if (typeof window._activateRoadTool === 'function') window._activateRoadTool();
      return;
    }

    var rows = paletteSection.querySelectorAll('.palette-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');

    if (placementMode && placementMode.type === item.type && placementMode.label === item.label) {
      placementMode = null;
      return;
    }

    placementMode = item;
    // Find matching row by iterating
    for (var j = 0; j < rows.length; j++) {
      var lbl = rows[j].querySelector('.palette-row-label');
      if (lbl && lbl.textContent === item.label) {
        rows[j].classList.add('active');
        break;
      }
    }
  }

  function getPlacementMode() { return placementMode; }

  function clearPlacement() {
    placementMode = null;
    var rows = paletteSection.querySelectorAll('.palette-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
  }

  function onPlace(fn) { onPlaceCallback = fn; }

  function placeAt(worldX, worldZ) {
    if (!placementMode) return null;
    var snapX = EditorGrid.snap(worldX);
    var snapZ = EditorGrid.snap(worldZ);

    // Prefab instantiation
    if (placementMode.type === 'prefab' && placementMode.prefabName) {
      if (typeof EditorPrefab !== 'undefined') {
        var ids = EditorPrefab.instantiate(placementMode.prefabName, snapX, snapZ);
        if (ids.length > 0) {
          refreshHierarchy();
          clearPlacement();
          EditorViewport.selectObject(ids[0]);
        }
        return ids[0] || null;
      }
      return null;
    }

    if (!onPlaceCallback) return null;

    var data = {};
    var defs = placementMode.defaults;
    for (var key in defs) data[key] = defs[key];
    data.x = snapX;
    data.z = snapZ;

    // Merge behaviors from placement mode (used by asset library)
    if (placementMode.behaviors) {
      data.behaviors = JSON.parse(JSON.stringify(placementMode.behaviors));
    }
    if (placementMode.tag) {
      data.tag = placementMode.tag;
    }

    var id = onPlaceCallback(placementMode.type, data);
    return id;
  }

  // =================================================================
  // CONTEXT MENU
  // =================================================================

  function createContextMenu() {
    ctxMenu = document.createElement('div');
    ctxMenu.id = 'hierarchy-context-menu';
    document.body.appendChild(ctxMenu);

    // Close on click outside
    document.addEventListener('mousedown', function(e) {
      if (ctxMenu && ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) {
        hideContextMenu();
      }
    });
    // Close on Esc
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && ctxMenu && ctxMenu.style.display !== 'none') {
        hideContextMenu();
      }
    });

    // Right-click on empty hierarchy space
    if (hierarchyList) {
      hierarchyList.addEventListener('contextmenu', function(e) {
        // Only fire if clicking directly on the UL, not on a child LI
        if (e.target === hierarchyList) {
          e.preventDefault();
          e.stopPropagation();
          showEmptyContextMenu(e.clientX, e.clientY);
        }
      });
    }
  }

  function showContextMenu(id, x, y) {
    if (!ctxMenu) return;
    ctxTargetId = id;
    var entry = Engine.getEntry(id);
    var isHidden = entry && entry.data && entry.data.hidden;

    ctxMenu.innerHTML = '';

    var items = [
      { label: 'Rename', shortcut: 'F2', action: function() { startRename(id); } },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: function() { duplicateById(id); } },
      { label: 'Delete', shortcut: 'Del', action: function() { deleteById(id); } },
      { label: 'Focus', shortcut: 'F', action: function() { focusById(id); } },
      'sep',
      { label: isHidden ? 'Show' : 'Hide', shortcut: 'H', action: function() { toggleVisibility(id); } },
      'sep',
      { label: 'New Folder', action: function() { createFolder(null); } }
    ];

    renderContextMenuItems(items, x, y);
  }

  function showFolderContextMenu(folderId, x, y) {
    if (!ctxMenu) return;
    ctxTargetId = folderId;

    ctxMenu.innerHTML = '';

    var items = [
      { label: 'Rename', shortcut: 'F2', action: function() { startFolderRename(folderId); } },
      { label: 'New Sub-folder', action: function() { createFolder(folderId); } },
      'sep',
      { label: 'Delete', action: function() { deleteFolder(folderId); } }
    ];

    renderContextMenuItems(items, x, y);
  }

  function showEmptyContextMenu(x, y) {
    if (!ctxMenu) return;
    ctxTargetId = null;

    ctxMenu.innerHTML = '';

    var items = [
      { label: 'New Folder', action: function() { createFolder(null); } }
    ];

    renderContextMenuItems(items, x, y);
  }

  function renderContextMenuItems(items, x, y) {
    ctxMenu.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      if (items[i] === 'sep') {
        var sep = document.createElement('div');
        sep.className = 'ctx-sep';
        ctxMenu.appendChild(sep);
      } else {
        var row = document.createElement('div');
        row.className = 'ctx-entry';
        var labelSpan = document.createTextNode(items[i].label);
        row.appendChild(labelSpan);
        if (items[i].shortcut) {
          var sc = document.createElement('span');
          sc.className = 'ctx-shortcut';
          sc.textContent = items[i].shortcut;
          row.appendChild(sc);
        }
        (function(action) {
          row.addEventListener('click', function() {
            hideContextMenu();
            action();
          });
        })(items[i].action);
        ctxMenu.appendChild(row);
      }
    }

    // Position — keep on screen
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';

    var rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ctxMenu.style.left = (window.innerWidth - rect.width - 4) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      ctxMenu.style.top = (window.innerHeight - rect.height - 4) + 'px';
    }
  }

  function hideContextMenu() {
    if (ctxMenu) {
      ctxMenu.style.display = 'none';
      ctxTargetId = null;
    }
  }

  // =================================================================
  // INLINE RENAME
  // =================================================================

  function startRename(id) {
    if (renameId) cancelRename();
    renameId = id;
    renameIsFolder = false;

    var li = hierarchyList ? hierarchyList.querySelector('li[data-id="' + id + '"]') : null;
    if (!li) return;

    var labelSpan = li.querySelector('.h-label');
    if (!labelSpan) return;

    var entry = Engine.getEntry(id);
    var currentName = (entry && entry.data && entry.data.tag) || id;

    renameInput = document.createElement('input');
    renameInput.className = 'h-rename-input';
    renameInput.type = 'text';
    renameInput.value = currentName;

    labelSpan.textContent = '';
    labelSpan.appendChild(renameInput);
    renameInput.focus();
    renameInput.select();

    renameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename(id, renameInput.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
      e.stopPropagation();
    });
    renameInput.addEventListener('blur', function() {
      // Small delay to allow click events to fire first
      setTimeout(function() {
        if (renameId === id && !renameIsFolder) commitRename(id, renameInput ? renameInput.value.trim() : '');
      }, 100);
    });
  }

  function startFolderRename(folderId) {
    if (renameId) cancelRename();
    renameId = folderId;
    renameIsFolder = true;

    var li = hierarchyList ? hierarchyList.querySelector('li[data-id="' + folderId + '"]') : null;
    if (!li) return;

    var labelSpan = li.querySelector('.h-label');
    if (!labelSpan) return;

    var folder = getFolderById(folderId);
    var currentName = folder ? folder.name : folderId;

    renameInput = document.createElement('input');
    renameInput.className = 'h-rename-input';
    renameInput.type = 'text';
    renameInput.value = currentName;

    labelSpan.textContent = '';
    labelSpan.appendChild(renameInput);
    renameInput.focus();
    renameInput.select();

    renameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitFolderRename(folderId, renameInput.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
      e.stopPropagation();
    });
    renameInput.addEventListener('blur', function() {
      setTimeout(function() {
        if (renameId === folderId && renameIsFolder) commitFolderRename(folderId, renameInput ? renameInput.value.trim() : '');
      }, 100);
    });
  }

  function commitRename(id, newName) {
    if (!newName) { cancelRename(); return; }
    var entry = Engine.getEntry(id);
    if (entry && entry.data) {
      entry.data.tag = newName;
    }
    renameId = null;
    renameInput = null;
    renameIsFolder = false;
    refreshHierarchy();
  }

  function commitFolderRename(folderId, newName) {
    if (!newName) { cancelRename(); return; }
    renameFolder(folderId, newName);
    renameId = null;
    renameInput = null;
    renameIsFolder = false;
    refreshHierarchy();
  }

  function cancelRename() {
    renameId = null;
    renameInput = null;
    renameIsFolder = false;
    refreshHierarchy();
  }

  function renameSelected() {
    var id = EditorViewport.getSelectedId();
    if (id) startRename(id);
  }

  // =================================================================
  // VISIBILITY TOGGLE
  // =================================================================

  function toggleVisibility(id) {
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    entry.data.hidden = !entry.data.hidden;
    if (entry.meshGroup) {
      entry.meshGroup.visible = !entry.data.hidden;
    }
    refreshHierarchy();
  }

  function toggleVisibilitySelected() {
    var id = EditorViewport.getSelectedId();
    if (id) toggleVisibility(id);
  }

  // =================================================================
  // ACTIONS (call into editor-main exposed functions or Engine directly)
  // =================================================================

  function deleteById(id) {
    Engine.unregister(id);
    var selId = EditorViewport.getSelectedId();
    if (selId === id) {
      EditorViewport.selectObject(null);
      if (typeof EditorGizmo !== 'undefined') EditorGizmo.detach();
      if (typeof EditorPanel !== 'undefined') EditorPanel.showProperties(null);
    }
    refreshHierarchy();
  }

  function duplicateById(id) {
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    var cloneData = JSON.parse(JSON.stringify(entry.data));
    var dupType = cloneData.primitive || 'box';
    delete cloneData.id;
    if (cloneData.x !== undefined) cloneData.x = (cloneData.x || 0) + 1;
    var newId = Engine.addObject(dupType, cloneData);
    if (newId) {
      refreshHierarchy();
      EditorViewport.selectObject(newId);
    }
  }

  function focusById(id) {
    var entry = Engine.getEntry(id);
    if (entry && entry.data) {
      var d = entry.data;
      EditorViewport.focusOn(new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0));
    }
  }

  // =================================================================
  // DRAG TO REORDER (with folder support)
  // =================================================================

  function startDrag(id, e, isFolder) {
    dragId = id;
    dragIsFolder = !!isFolder;
    var li = hierarchyList.querySelector('li[data-id="' + id + '"]');
    if (li) li.classList.add('dragging');

    var onMove = function(ev) { onDrag(ev); };
    var onUp = function(ev) {
      endDrag(ev);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onDrag(e) {
    if (!dragId) return;

    // Clear previous indicators
    clearDragIndicators();

    // Find which li we're over
    var target = findHierarchyLiFromPoint(e.clientX, e.clientY);
    if (!target || target.getAttribute('data-id') === dragId) return;

    var targetId = target.getAttribute('data-id');
    var targetIsFolder = target.getAttribute('data-folder') === 'true';
    var rect = target.getBoundingClientRect();
    var relY = e.clientY - rect.top;
    var third = rect.height / 3;

    // Determine if target is a folder or an "empty" group
    var isDropContainer = targetIsFolder;
    if (!isDropContainer) {
      var entry = Engine.getEntry(targetId);
      isDropContainer = entry && entry.data && entry.data.primitive === 'empty';
    }

    if (relY < third) {
      dragPos = 'above';
      target.classList.add('drag-over-above');
    } else if (relY > third * 2 && isDropContainer) {
      dragPos = 'into';
      target.classList.add('drag-over-into');
    } else {
      dragPos = 'below';
      target.classList.add('drag-over-below');
    }
    dragOverId = targetId;
    dragOverIsFolder = targetIsFolder;
  }

  function endDrag(e) {
    clearDragIndicators();

    if (dragId && dragOverId && dragId !== dragOverId) {
      applyReorder(dragId, dragIsFolder, dragOverId, dragOverIsFolder, dragPos);
    }

    // Remove dragging class
    if (dragId) {
      var li = hierarchyList ? hierarchyList.querySelector('li[data-id="' + dragId + '"]') : null;
      if (li) li.classList.remove('dragging');
    }

    dragId = null;
    dragIsFolder = false;
    dragOverId = null;
    dragOverIsFolder = false;
    dragPos = null;
  }

  function clearDragIndicators() {
    if (!hierarchyList) return;
    var items = hierarchyList.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('drag-over-above', 'drag-over-below', 'drag-over-into');
    }
  }

  function findHierarchyLiFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== hierarchyList) {
      if (el.tagName === 'LI' && el.getAttribute('data-id')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function applyReorder(srcId, srcIsFolder, targetId, targetIsFolder, position) {
    // --- "INTO" a folder ---
    if (position === 'into' && targetIsFolder) {
      if (srcIsFolder) {
        // Prevent nesting a folder into itself or its descendants
        if (isDescendantFolder(targetId, srcId)) return;
        var srcFolder = getFolderById(srcId);
        if (srcFolder) srcFolder.parentId = targetId;
      } else {
        var srcEntry = Engine.getEntry(srcId);
        if (srcEntry && srcEntry.data) {
          srcEntry.data.folderId = targetId;
          delete srcEntry.data.groupId;
        }
      }
      expandedGroups[targetId] = true;
      refreshHierarchy();
      return;
    }

    // --- "INTO" an empty object (old group behavior) ---
    if (position === 'into' && !targetIsFolder) {
      if (!srcIsFolder) {
        var srcEntry2 = Engine.getEntry(srcId);
        if (srcEntry2 && srcEntry2.data) {
          srcEntry2.data.groupId = targetId;
          delete srcEntry2.data.folderId;
          expandedGroups[targetId] = true;
        }
      }
      refreshHierarchy();
      return;
    }

    // --- ABOVE / BELOW ---
    // Determine what container the target is in and adopt that container
    if (srcIsFolder) {
      var srcFolder2 = getFolderById(srcId);
      if (!srcFolder2) return;
      if (targetIsFolder) {
        var targetFolder = getFolderById(targetId);
        srcFolder2.parentId = targetFolder ? targetFolder.parentId : null;
      } else {
        // Dropping folder above/below an object — match the object's folderId as parentId
        var targetEntry = Engine.getEntry(targetId);
        var targetFolderId = (targetEntry && targetEntry.data) ? targetEntry.data.folderId : undefined;
        srcFolder2.parentId = targetFolderId || null;
      }
    } else {
      var srcEntry3 = Engine.getEntry(srcId);
      if (!srcEntry3 || !srcEntry3.data) return;
      if (targetIsFolder) {
        var targetFolder2 = getFolderById(targetId);
        srcEntry3.data.folderId = targetFolder2 ? targetFolder2.parentId : undefined;
        if (!srcEntry3.data.folderId) delete srcEntry3.data.folderId;
        // Also clear old groupId
        delete srcEntry3.data.groupId;
      } else {
        var targetEntry2 = Engine.getEntry(targetId);
        if (targetEntry2 && targetEntry2.data) {
          srcEntry3.data.folderId = targetEntry2.data.folderId || undefined;
          if (!srcEntry3.data.folderId) delete srcEntry3.data.folderId;
          srcEntry3.data.groupId = targetEntry2.data.groupId || undefined;
          if (!srcEntry3.data.groupId) delete srcEntry3.data.groupId;
        }
      }
    }

    // Reorder _order values for objects
    if (!srcIsFolder) {
      var entries = Engine.getAllEntries();
      var all = [];
      for (var id in entries) {
        all.push({ id: id, data: entries[id].data });
      }
      all.sort(function(a, b) {
        var oa = (a.data._order !== undefined) ? a.data._order : 99999;
        var ob = (b.data._order !== undefined) ? b.data._order : 99999;
        if (oa !== ob) return oa - ob;
        return a.id < b.id ? -1 : 1;
      });

      var srcItem = null;
      var filtered = [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === srcId) srcItem = all[i];
        else filtered.push(all[i]);
      }
      if (srcItem) {
        var insertIdx = -1;
        for (var j = 0; j < filtered.length; j++) {
          if (filtered[j].id === targetId) { insertIdx = j; break; }
        }
        if (insertIdx === -1) filtered.push(srcItem);
        else if (position === 'below') filtered.splice(insertIdx + 1, 0, srcItem);
        else filtered.splice(insertIdx, 0, srcItem);

        for (var k = 0; k < filtered.length; k++) filtered[k].data._order = k;
      }
    } else {
      // Reorder folder _order values
      var srcF = getFolderById(srcId);
      var targetF = getFolderById(targetId);
      if (srcF) {
        // Collect sibling folders
        var siblings = [];
        for (var fi = 0; fi < folders.length; fi++) {
          if (folders[fi].parentId === srcF.parentId) siblings.push(folders[fi]);
        }
        siblings.sort(function(a, b) {
          var oa = (a._order !== undefined) ? a._order : 99999;
          var ob = (b._order !== undefined) ? b._order : 99999;
          return oa - ob;
        });
        // Remove src and reinsert
        var srcFItem = null;
        var filteredF = [];
        for (var fi2 = 0; fi2 < siblings.length; fi2++) {
          if (siblings[fi2].id === srcId) srcFItem = siblings[fi2];
          else filteredF.push(siblings[fi2]);
        }
        if (srcFItem && targetF) {
          var tidx = -1;
          for (var fi3 = 0; fi3 < filteredF.length; fi3++) {
            if (filteredF[fi3].id === targetId) { tidx = fi3; break; }
          }
          if (tidx === -1) filteredF.push(srcFItem);
          else if (position === 'below') filteredF.splice(tidx + 1, 0, srcFItem);
          else filteredF.splice(tidx, 0, srcFItem);
        } else if (srcFItem) {
          filteredF.push(srcFItem);
        }
        for (var fi4 = 0; fi4 < filteredF.length; fi4++) filteredF[fi4]._order = fi4;
      }
    }

    refreshHierarchy();
  }

  function isDescendantFolder(potentialDescendantId, ancestorId) {
    // Check if potentialDescendantId is a descendant of ancestorId
    var current = potentialDescendantId;
    var seen = {};
    while (current) {
      if (current === ancestorId) return true;
      if (seen[current]) break;
      seen[current] = true;
      var f = getFolderById(current);
      current = f ? f.parentId : null;
    }
    return false;
  }

  // =================================================================
  // HIERARCHY — unified folder + object tree
  // =================================================================

  function refreshHierarchy() {
    if (!hierarchyList) return;
    hierarchyList.innerHTML = '';

    var entries = Engine.getAllEntries();
    var allObjects = [];
    for (var id in entries) {
      allObjects.push({ id: id, type: entries[id].data.primitive || 'box', data: entries[id].data });
    }

    // Sort objects by _order
    allObjects.sort(function(a, b) {
      var oa = (a.data._order !== undefined) ? a.data._order : 99999;
      var ob = (b.data._order !== undefined) ? b.data._order : 99999;
      if (oa !== ob) return oa - ob;
      return a.id < b.id ? -1 : 1;
    });

    // Build tree: render root-level items (folders + objects with no folderId)
    renderChildren(null, 0, allObjects);

    applySearch();

    // Restore selection highlight
    var selId = EditorViewport.getSelectedId();
    if (selId) highlightHierarchy(selId);
  }

  function renderChildren(parentFolderId, depth, allObjects) {
    // 1. Collect folders at this level
    var childFolders = [];
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      if ((f.parentId || null) === (parentFolderId || null)) {
        childFolders.push(f);
      }
    }
    childFolders.sort(function(a, b) {
      var oa = (a._order !== undefined) ? a._order : 99999;
      var ob = (b._order !== undefined) ? b._order : 99999;
      if (oa !== ob) return oa - ob;
      return a.name < b.name ? -1 : 1;
    });

    // 2. Collect objects at this level
    var childObjects = [];
    for (var j = 0; j < allObjects.length; j++) {
      var obj = allObjects[j];
      if (parentFolderId) {
        // Objects inside a folder
        if (obj.data.folderId === parentFolderId) childObjects.push(obj);
      } else {
        // Root-level objects (no folderId, or empty/undefined folderId)
        if (!obj.data.folderId) {
          childObjects.push(obj);
        }
      }
    }

    // 3. Render folders first, then objects
    for (var fi = 0; fi < childFolders.length; fi++) {
      renderFolderRow(childFolders[fi], depth, allObjects);
    }

    // 4. Render objects (preserving old groupId grouping within this folder level)
    var groupChildren = {};
    var rootItems = [];
    for (var oi = 0; oi < childObjects.length; oi++) {
      var item = childObjects[oi];
      if (item.data.groupId) {
        if (!groupChildren[item.data.groupId]) groupChildren[item.data.groupId] = [];
        groupChildren[item.data.groupId].push(item);
      } else {
        rootItems.push(item);
      }
    }

    for (var ri = 0; ri < rootItems.length; ri++) {
      var rItem = rootItems[ri];
      var children = groupChildren[rItem.id];
      if (children && children.length > 0) {
        renderGroupHeader(rItem, children, depth);
      } else {
        renderHierarchyItem(rItem, depth);
      }
    }
  }

  function renderFolderRow(folder, depth, allObjects) {
    var isExpanded = expandedGroups[folder.id] !== false;
    var li = document.createElement('li');
    li.className = 'hierarchy-folder-row';
    li.setAttribute('data-id', folder.id);
    li.setAttribute('data-folder', 'true');
    li.style.paddingLeft = (depth * 16 + 8) + 'px';

    // Toggle arrow
    var toggle = document.createElement('span');
    toggle.className = 'hierarchy-toggle' + (isExpanded ? ' open' : '');
    toggle.textContent = isExpanded ? '\u25BE' : '\u25B8';
    (function(fid, exp) {
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        expandedGroups[fid] = !exp;
        refreshHierarchy();
      });
    })(folder.id, isExpanded);
    li.appendChild(toggle);

    // Folder icon
    var icon = document.createElement('span');
    icon.className = 'h-icon h-folder-icon';
    icon.innerHTML = EditorIcons.get(isExpanded ? 'folderOpen' : 'folder');
    li.appendChild(icon);

    // Label
    var labelSpan = document.createElement('span');
    labelSpan.className = 'h-label';
    labelSpan.textContent = folder.name;
    li.appendChild(labelSpan);

    // Click — no select (folders aren't scene objects), but toggle expand
    (function(fid) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.hierarchy-toggle')) return;
        // Deselect any object when clicking a folder
        EditorViewport.selectObject(null);
        if (typeof EditorGizmo !== 'undefined') EditorGizmo.detach();
        if (typeof EditorPanel !== 'undefined') EditorPanel.showProperties(null);
      });
    })(folder.id);

    // Double-click label → rename folder
    (function(fid) {
      labelSpan.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        startFolderRename(fid);
      });
    })(folder.id);

    // Right-click → folder context menu
    (function(fid) {
      li.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showFolderContextMenu(fid, e.clientX, e.clientY);
      });
    })(folder.id);

    // Drag start
    (function(fid) {
      li.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.hierarchy-toggle')) return;
        if (e.target.tagName === 'INPUT') return;
        var startX = e.clientX, startY = e.clientY;
        var moved = false;
        var onMove = function(ev) {
          if (!moved && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
            moved = true;
            startDrag(fid, ev, true);
          }
        };
        var onUp = function() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })(folder.id);

    hierarchyList.appendChild(li);

    // Render children if expanded
    if (isExpanded) {
      renderChildren(folder.id, depth + 1, allObjects);
    }
  }

  function renderGroupHeader(parent, children, depth) {
    var isExpanded = expandedGroups[parent.id] !== false;
    var li = document.createElement('li');
    li.className = 'hierarchy-group-header';
    if (parent.data.hidden) li.classList.add('h-row-hidden');
    li.setAttribute('data-id', parent.id);
    li.setAttribute('data-type', parent.type);
    li.style.paddingLeft = (depth * 16 + 8) + 'px';

    // Toggle arrow
    var toggle = document.createElement('span');
    toggle.className = 'hierarchy-toggle' + (isExpanded ? ' open' : '');
    toggle.textContent = isExpanded ? '\u25BE' : '\u25B8';
    (function(pid) {
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        expandedGroups[pid] = !isExpanded;
        refreshHierarchy();
      });
    })(parent.id);
    li.appendChild(toggle);

    // SVG icon
    var icon = document.createElement('span');
    icon.className = 'h-icon';
    icon.innerHTML = EditorIcons.has(parent.type) ? EditorIcons.get(parent.type) : '';
    li.appendChild(icon);

    // Label
    var labelSpan = document.createElement('span');
    labelSpan.className = 'h-label';
    labelSpan.textContent = parent.data.tag || parent.id;
    li.appendChild(labelSpan);

    // Eye icon
    appendEyeIcon(li, parent);

    // Click → select
    (function(id) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.hierarchy-toggle') || e.target.closest('.h-eye')) return;
        EditorViewport.selectObject(id);
      });
    })(parent.id);

    // Double-click label → rename
    (function(id) {
      labelSpan.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        startRename(id);
      });
    })(parent.id);

    // Right-click → context menu
    (function(id) {
      li.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(id, e.clientX, e.clientY);
      });
    })(parent.id);

    // Drag start
    (function(id) {
      li.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.hierarchy-toggle') || e.target.closest('.h-eye')) return;
        if (e.target.tagName === 'INPUT') return;
        var startX = e.clientX, startY = e.clientY;
        var moved = false;
        var onMove = function(ev) {
          if (!moved && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
            moved = true;
            startDrag(id, ev, false);
          }
        };
        var onUp = function() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })(parent.id);

    hierarchyList.appendChild(li);

    if (isExpanded) {
      for (var ci = 0; ci < children.length; ci++) {
        renderHierarchyItem(children[ci], depth + 1);
      }
    }
  }

  function renderHierarchyItem(item, depth) {
    var li = document.createElement('li');
    if (item.data.hidden) li.classList.add('h-row-hidden');
    li.setAttribute('data-id', item.id);
    li.setAttribute('data-type', item.type);
    li.style.paddingLeft = (depth * 16 + 8) + 'px';

    // SVG icon
    var icon = document.createElement('span');
    icon.className = 'h-icon';
    icon.innerHTML = EditorIcons.has(item.type) ? EditorIcons.get(item.type) : '';
    li.appendChild(icon);

    // Label
    var labelSpan = document.createElement('span');
    labelSpan.className = 'h-label';
    labelSpan.textContent = item.data.tag || item.id;
    li.appendChild(labelSpan);

    // Eye icon
    appendEyeIcon(li, item);

    // Click → select
    (function(id) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.h-eye')) return;
        EditorViewport.selectObject(id);
      });
    })(item.id);

    // Double-click label → rename
    (function(id) {
      labelSpan.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        startRename(id);
      });
    })(item.id);

    // Right-click → context menu
    (function(id) {
      li.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(id, e.clientX, e.clientY);
      });
    })(item.id);

    // Drag start
    (function(id) {
      li.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.h-eye')) return;
        if (e.target.tagName === 'INPUT') return;
        var startX = e.clientX, startY = e.clientY;
        var moved = false;
        var onMove = function(ev) {
          if (!moved && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
            moved = true;
            startDrag(id, ev, false);
          }
        };
        var onUp = function() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })(item.id);

    hierarchyList.appendChild(li);
  }

  function appendEyeIcon(li, item) {
    var eye = document.createElement('span');
    eye.className = 'h-eye' + (item.data.hidden ? ' hidden' : ' visible');
    eye.innerHTML = item.data.hidden ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
    eye.title = item.data.hidden ? 'Show' : 'Hide';
    (function(id) {
      eye.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleVisibility(id);
      });
    })(item.id);
    li.appendChild(eye);
  }

  function highlightHierarchy(id) {
    if (!hierarchyList) return;
    var items = hierarchyList.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('selected', items[i].getAttribute('data-id') === id);
    }
  }

  function highlightHierarchyMulti(ids) {
    if (!hierarchyList) return;
    var items = hierarchyList.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      var itemId = items[i].getAttribute('data-id');
      items[i].classList.toggle('selected', ids.indexOf(itemId) !== -1);
    }
  }

  function initSearchAndFilter() {
    if (searchInput) {
      searchInput.addEventListener('input', function() { applySearch(); });
    }
    // Hide the filter container — search is enough
    if (filterContainer) filterContainer.style.display = 'none';
  }

  function applySearch() {
    if (!hierarchyList) return;
    var query = searchInput ? searchInput.value.toLowerCase() : '';
    if (!query) {
      // Show all
      var allItems = hierarchyList.querySelectorAll('li');
      for (var a = 0; a < allItems.length; a++) allItems[a].style.display = '';
      return;
    }

    var items = hierarchyList.querySelectorAll('li');
    // First pass: determine which items match
    var matchIds = {};
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var id = li.getAttribute('data-id') || '';
      var text = li.textContent.toLowerCase();
      var match = text.indexOf(query) !== -1 || id.toLowerCase().indexOf(query) !== -1;
      if (match) matchIds[id] = true;
    }

    // Second pass: show matches, and also show ancestor folders
    for (var j = 0; j < items.length; j++) {
      var li2 = items[j];
      var id2 = li2.getAttribute('data-id') || '';
      var visible = !!matchIds[id2];

      // If this is a folder, show it if any descendant matches
      if (!visible && li2.getAttribute('data-folder') === 'true') {
        visible = folderHasMatchingDescendant(id2, matchIds);
      }

      li2.style.display = visible ? '' : 'none';
    }
  }

  function folderHasMatchingDescendant(folderId, matchIds) {
    // Check sub-folders
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].parentId === folderId) {
        if (matchIds[folders[i].id]) return true;
        if (folderHasMatchingDescendant(folders[i].id, matchIds)) return true;
      }
    }
    // Check objects in this folder
    var entries = Engine.getAllEntries();
    for (var oid in entries) {
      if (entries[oid].data.folderId === folderId && matchIds[oid]) return true;
    }
    return false;
  }

  function scrollToItem(id) {
    if (!hierarchyList) return;
    var li = hierarchyList.querySelector('li[data-id="' + id + '"]');
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  return {
    init: init,
    getPlacementMode: getPlacementMode,
    clearPlacement: clearPlacement,
    placeAt: placeAt,
    onPlace: onPlace,
    refreshHierarchy: refreshHierarchy,
    highlightHierarchy: highlightHierarchy,
    highlightHierarchyMulti: highlightHierarchyMulti,
    scrollToItem: scrollToItem,
    renameSelected: renameSelected,
    toggleVisibilitySelected: toggleVisibilitySelected,
    hideContextMenu: hideContextMenu,
    loadFolders: loadFolders,
    getFolderData: getFolderData,
    setPlacementMode: setPlacementMode,
    buildAssetSection: buildAssetSection,
    buildPaletteUI: buildPaletteUI
  };
})();
