// ============================================================
// EDITOR-IO — Save/load scene.json, Test in Game
// ============================================================

var EditorIO = (function() {
  'use strict';

  var sceneData = null;

  function init(data) {
    sceneData = data;
  }

  // Clone data object, stripping editor-only fields and converting colors
  function cleanData(d) {
    var clean = {};
    for (var key in d) {
      if (key === 'sceneType') continue;
      var val = d[key];
      if (key === 'color' && typeof val === 'number') {
        val = '0x' + ('000000' + val.toString(16).toUpperCase()).slice(-6);
      }
      clean[key] = val;
    }
    return clean;
  }

  // Collect current state from Engine registry into scene data
  function collectSceneData() {
    var data = JSON.parse(JSON.stringify(sceneData));
    var entries = Engine.getAllEntries();

    var objects = [];
    for (var id in entries) {
      var entry = entries[id];
      var d = entry.data;
      var clean = cleanData(d);
      objects.push(clean);
    }

    // Sort by ID for stable output
    objects.sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    data.objects = objects;

    // Persist folder data
    if (typeof EditorPalette !== 'undefined' && EditorPalette.getFolderData) {
      data.folders = EditorPalette.getFolderData();
    }

    return data;
  }

  // Save to file download
  function saveFile() {
    var data = collectSceneData();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[EditorIO] Scene saved to file');
  }

  // Save to server via POST (project-aware)
  function saveServer(callback) {
    var data = collectSceneData();
    var json = JSON.stringify(data, null, 2);
    var xhr = new XMLHttpRequest();
    if (window._projectUID) {
      xhr.open('PUT', '/api/projects/' + window._projectUID + '/scene', true);
    } else {
      xhr.open('POST', '/save-scene', true);
    }
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 401) { window.location.href = '/login'; return; }
      if (xhr.status === 200) {
        console.log('[EditorIO] Scene saved to server');
        if (callback) callback(null);
      } else {
        console.error('[EditorIO] Server save failed:', xhr.status);
        if (callback) callback(new Error('Save failed: ' + xhr.status));
      }
    };
    xhr.onerror = function() {
      console.error('[EditorIO] Server save network error');
      if (callback) callback(new Error('Network error'));
    };
    xhr.send(json);
  }

  // Load from file picker
  function loadFile(callback) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(re) {
        try {
          var data = JSON.parse(re.target.result);
          var validation = SceneSchema.validateScene(data);
          if (!validation.valid) {
            console.warn('[EditorIO] Validation warnings:', validation.errors);
          }
          sceneData = data;
          console.log('[EditorIO] Scene loaded from file');
          if (callback) callback(null, data);
        } catch(err) {
          console.error('[EditorIO] Parse error:', err);
          if (callback) callback(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Test in game via localStorage bridge
  function testInGame() {
    var data = collectSceneData();
    try {
      localStorage.setItem('xj_scene_preview', JSON.stringify(data));
      window.open('index-3d.html', '_blank');
      console.log('[EditorIO] Preview saved to localStorage, opening game');
    } catch(e) {
      console.error('[EditorIO] Could not save preview:', e);
    }
  }

  // Clear localStorage preview
  function clearPreview() {
    try {
      localStorage.removeItem('xj_scene_preview');
    } catch(e) {}
  }

  // --- Export to standalone HTML bundle ---
  var GAME_SCRIPTS = [
    'js/lib/three.min.js',
    'js/lib/GLTFLoader.js',
    'js/scene-id.js',
    'js/scene-schema.js',
    'js/scene-loader.js',
    'js/controls.js',
    'js/collision.js',
    'js/engine.js',
    'js/face-material.js',
    'js/builder-single.js',
    'js/npcs.js',
    'js/script-registry.js',
    'js/world.js',
    'js/main.js'
  ];

  function exportHTML(callback) {
    var data = collectSceneData();
    var sceneJSON = JSON.stringify(data);
    var title = (data.title || 'Pegasus Game');

    // Fetch all game scripts in parallel
    var loaded = {};
    var remaining = GAME_SCRIPTS.length;
    var failed = false;

    for (var i = 0; i < GAME_SCRIPTS.length; i++) {
      (function(src) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', src, true);
        xhr.responseType = 'text';
        xhr.onload = function() {
          if (xhr.status === 200) {
            loaded[src] = xhr.responseText;
          } else {
            loaded[src] = '// Failed to load: ' + src;
            console.warn('[Export] Failed to fetch:', src);
          }
          remaining--;
          if (remaining === 0 && !failed) buildBundle();
        };
        xhr.onerror = function() {
          loaded[src] = '// Network error: ' + src;
          remaining--;
          if (remaining === 0 && !failed) buildBundle();
        };
        xhr.send();
      })(GAME_SCRIPTS[i]);
    }

    function buildBundle() {
      var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
      html += '<meta charset="UTF-8">\n';
      html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n';
      html += '<title>' + escapeHTML(title) + '</title>\n';
      html += '<style>\n';
      html += '* { margin:0; padding:0; box-sizing:border-box; }\n';
      html += 'html, body { width:100%; height:100%; overflow:hidden; background:#000; }\n';
      html += '#game-canvas { display:block; width:100%; height:100%; touch-action:none; }\n';
      html += '#loading-screen { position:fixed; top:0; left:0; width:100%; height:100%; background:#111; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:100; color:#fff; font-family:sans-serif; }\n';
      html += '#loading-screen h1 { font-size:1.8em; margin-bottom:0.3em; }\n';
      html += '#loading-screen p { font-size:0.9em; color:#888; margin-bottom:1.5em; }\n';
      html += '.loader-bar { width:200px; height:4px; background:#333; border-radius:2px; overflow:hidden; }\n';
      html += '.loader-fill { width:0%; height:100%; background:#fff; transition:width 0.3s; }\n';
      html += '#crosshair { display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); pointer-events:none; z-index:10; width:20px; height:20px; }\n';
      html += '#crosshair::before, #crosshair::after { content:""; position:absolute; background:rgba(255,255,255,0.6); }\n';
      html += '#crosshair::before { width:2px; height:20px; left:9px; top:0; }\n';
      html += '#crosshair::after { width:20px; height:2px; left:0; top:9px; }\n';
      html += '#joystick-base { display:none; position:fixed; width:120px; height:120px; border-radius:50%; border:2px solid rgba(255,255,255,0.25); background:rgba(0,0,0,0.15); pointer-events:none; z-index:20; }\n';
      html += '#joystick-knob { position:absolute; width:50px; height:50px; border-radius:50%; background:rgba(255,255,255,0.35); pointer-events:none; }\n';
      html += '#controls-hint { position:fixed; bottom:12px; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.5); font:12px sans-serif; pointer-events:none; z-index:10; text-align:center; }\n';
      html += '#dialog-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center; z-index:50; pointer-events:none; }\n';
      html += '.dialog-box { background:rgba(0,0,0,0.85); color:#fff; padding:24px 32px; border-radius:8px; max-width:400px; text-align:center; font-family:sans-serif; }\n';
      html += '.dialog-title { font-size:1.3em; font-weight:bold; margin-bottom:8px; }\n';
      html += '.dialog-text { font-size:1em; color:#ccc; }\n';
      html += '</style>\n</head>\n<body>\n\n';

      // HTML elements
      html += '<canvas id="game-canvas"></canvas>\n';
      html += '<div id="loading-screen"><h1>' + escapeHTML(title) + '</h1><p>Loading...</p><div class="loader-bar"><div class="loader-fill" id="loader-fill"></div></div></div>\n';
      html += '<div id="crosshair"></div>\n';
      html += '<div id="joystick-base"><div id="joystick-knob"></div></div>\n';
      html += '<div id="controls-hint"></div>\n';
      html += '<div id="dialog-overlay"><div class="dialog-box"><div class="dialog-title"></div><div class="dialog-text"></div></div></div>\n\n';

      // Embed scene data — inject into localStorage before game scripts load
      html += '<script>\n';
      html += 'try { localStorage.setItem("xj_scene_preview", ' + JSON.stringify(sceneJSON) + '); } catch(e) {}\n';
      html += '</script>\n\n';

      // Inline all game scripts
      for (var si = 0; si < GAME_SCRIPTS.length; si++) {
        var src = GAME_SCRIPTS[si];
        html += '<!-- ' + src + ' -->\n';
        html += '<script>\n';
        html += (loaded[src] || '// missing') + '\n';
        html += '</script>\n\n';
      }

      // Controls hint + loading bar
      html += '<script>\n';
      html += '(function(){\n';
      html += '  var hint=document.getElementById("controls-hint");\n';
      html += '  if("ontouchstart" in window||navigator.maxTouchPoints>0){hint.textContent="Left: move | Right: look";}else{hint.textContent="Click to look | WASD to move | Shift to sprint | Space to jump";}\n';
      html += '  setTimeout(function(){hint.style.opacity="0";hint.style.transition="opacity 2s";},8000);\n';
      html += '  var fill=document.getElementById("loader-fill");\n';
      html += '  if(fill){var p=0;var iv=setInterval(function(){p=Math.min(p+15,90);fill.style.width=p+"%";if(p>=90)clearInterval(iv);},100);}\n';
      html += '})();\n';
      html += '</script>\n\n';

      html += '</body>\n</html>';

      // Download
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'game') + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[EditorIO] Exported standalone HTML (' + Math.round(html.length / 1024) + ' KB)');
      if (callback) callback(null, html.length);
    }
  }

  function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Autosave on change (debounced) ----
  var saveDebounce = null;
  var SAVE_DELAY = 2000; // 2 seconds after last change

  function triggerSave() {
    if (!window._projectUID) return;
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(doAutosave, SAVE_DELAY);
  }

  function startAutosave() {
    if (!window._projectUID) return;
    EditorHistory.onPush(triggerSave);
  }

  function doAutosave() {
    if (!window._projectUID) return;
    var data = collectSceneData();
    var json = JSON.stringify(data);
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/projects/' + window._projectUID + '/scene', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        console.log('[EditorIO] Saved');
        if (typeof EditorPanels !== 'undefined' && EditorPanels.refreshBackups) {
          EditorPanels.refreshBackups();
        }
      }
    };
    xhr.send(json);
  }

  return {
    init: init,
    saveFile: saveFile,
    saveServer: saveServer,
    loadFile: loadFile,
    testInGame: testInGame,
    clearPreview: clearPreview,
    collectSceneData: collectSceneData,
    exportHTML: exportHTML,
    startAutosave: startAutosave,
    triggerSave: triggerSave
  };
})();
