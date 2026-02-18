// ============================================================
// EDITOR-PLAYTEST — Inline play/stop (test game in viewport)
// ============================================================

var EditorPlaytest = (function() {
  'use strict';

  var playing = false;
  var sceneRef = null;
  var rendererRef = null;
  var gameCamera = null;
  var gameClock = null;
  var hudEl = null;
  var hiddenObjects = [];  // { obj, wasVisible } pairs
  var gridWasVisible = true;

  function init(scene) {
    sceneRef = scene;
  }

  function play() {
    if (playing) return;
    playing = true;

    rendererRef = EditorViewport.getRenderer();
    var canvas = rendererRef.domElement;
    // Collect live scene data from Engine registry (includes ALL objects, not just originally-loaded)
    var sd = (typeof EditorIO !== 'undefined' && EditorIO.collectSceneData)
      ? EditorIO.collectSceneData()
      : Engine.getSceneDataRef();
    if (!sd) { playing = false; return; }

    // --- Build collision from current scene data ---
    Collision.buildFromScene(sd);

    // --- Find spawn position ---
    var spawnX = 50, spawnY = 0, spawnZ = 50, spawnRot = 0, eyeH = 1.6;
    if (sd.spawn) {
      spawnX = sd.spawn.x || spawnX;
      spawnZ = sd.spawn.z || spawnZ;
      spawnRot = sd.spawn.rot || 0;
    }
    // Also check for spawn behavior objects (higher priority)
    if (sd.objects) {
      for (var i = 0; i < sd.objects.length; i++) {
        var obj = sd.objects[i];
        if (obj.behaviors) {
          for (var b = 0; b < obj.behaviors.length; b++) {
            if (obj.behaviors[b].type === 'spawn') {
              spawnX = obj.x !== undefined ? obj.x : spawnX;
              spawnY = obj.y || 0;
              spawnZ = obj.z !== undefined ? obj.z : spawnZ;
              spawnRot = obj.rotY || obj.rot || 0;
              break;
            }
          }
        }
      }
    }
    if (sd.player) {
      eyeH = sd.player.eyeHeight || eyeH;
    }

    // --- Create game camera ---
    var aspect = canvas.clientWidth / canvas.clientHeight;
    gameCamera = new THREE.PerspectiveCamera(70, aspect, 0.1, 300);
    gameCamera.position.set(spawnX, spawnY + eyeH, spawnZ);
    gameClock = new THREE.Clock();

    // --- Hide editor helpers (grid, gizmo, wireframe markers) ---
    gridWasVisible = EditorGrid.isVisible();
    EditorGrid.setVisible(false);
    EditorGizmo.detach();

    // Hide all helper meshes (spawn figures, light icons, empty wireframes)
    hiddenObjects = [];
    sceneRef.traverse(function(child) {
      if (child.userData && child.userData.isHelper && child.visible) {
        hiddenObjects.push(child);
        child.visible = false;
      }
    });

    // --- Disable editor input ---
    EditorViewport.setEnabled(false);

    // --- Init FP controls ---
    if (typeof FPControls === 'undefined') {
      console.error('[Playtest] FPControls not loaded — is controls.js included?');
      // Rollback: restore editor state
      EditorViewport.setEnabled(true);
      EditorGrid.setVisible(gridWasVisible);
      for (var h = 0; h < hiddenObjects.length; h++) hiddenObjects[h].visible = true;
      hiddenObjects = [];
      gameCamera = null; gameClock = null;
      playing = false;
      return;
    }
    var controlsConfig = {
      eyeHeight: eyeH,
      walkSpeed: (sd.player && sd.player.walkSpeed) || 4.0,
      sprintSpeed: (sd.player && sd.player.sprintSpeed) || 8.0,
      radius: (sd.player && sd.player.radius) || 0.3,
      spawnX: spawnX,
      spawnZ: spawnZ,
      spawnRot: spawnRot
    };
    if (sd.player && sd.player.gravity !== undefined) controlsConfig.gravity = sd.player.gravity;
    if (sd.player && sd.player.jumpSpeed !== undefined) controlsConfig.jumpSpeed = sd.player.jumpSpeed;
    FPControls.init(gameCamera, canvas, sceneRef, controlsConfig);

    // --- Show play HUD ---
    showHUD();

    // --- Update UI ---
    updatePlayButton(true);
  }

  function stop() {
    if (!playing) return;
    playing = false;

    // --- Cleanup FPControls ---
    if (typeof FPControls !== 'undefined') FPControls.dispose();
    if (document.pointerLockElement) document.exitPointerLock();

    // --- Restore editor helpers ---
    for (var i = 0; i < hiddenObjects.length; i++) {
      hiddenObjects[i].visible = true;
    }
    hiddenObjects = [];
    EditorGrid.setVisible(gridWasVisible);

    // --- Re-enable editor ---
    EditorViewport.setEnabled(true);

    // --- Remove HUD ---
    hideHUD();

    // --- Dispose game camera ---
    gameCamera = null;
    gameClock = null;

    // --- Update UI ---
    updatePlayButton(false);
  }

  function toggle() {
    if (playing) stop(); else play();
  }

  // --- Render one frame of game (called from animate loop) ---
  function renderFrame(renderer) {
    if (!playing || !gameCamera || !gameClock) return;

    var dt = Math.min(gameClock.getDelta(), 0.05);
    FPControls.update(dt, Collision.resolve);

    // Ensure full-canvas viewport (EditorQuad may have left partial viewport)
    var canvas = renderer.domElement;
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cw, ch);
    renderer.render(sceneRef, gameCamera);
  }

  function isPlaying() { return playing; }

  // --- HUD overlay (stop button + crosshair + hint) ---
  function showHUD() {
    hudEl = document.createElement('div');
    hudEl.id = 'play-hud';
    hudEl.innerHTML =
      '<div id="play-crosshair">+</div>' +
      '<div id="play-topbar">' +
        '<button id="play-stop-btn">Stop</button>' +
        '<span id="play-hint">Press Esc to stop</span>' +
      '</div>';
    document.getElementById('canvas-wrap').appendChild(hudEl);

    document.getElementById('play-stop-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      stop();
    });
  }

  function hideHUD() {
    if (hudEl && hudEl.parentNode) {
      hudEl.parentNode.removeChild(hudEl);
    }
    hudEl = null;
  }

  // --- Toggle play button appearance in the menu bar ---
  function updatePlayButton(isPlaying) {
    var btn = document.getElementById('play-toggle');
    if (!btn) return;
    if (isPlaying) {
      btn.classList.add('playing');
      btn.innerHTML = '&#9632; Stop';
      btn.title = 'Stop (F5)';
    } else {
      btn.classList.remove('playing');
      btn.innerHTML = '&#9654; Play';
      btn.title = 'Play (F5)';
    }
  }

  // --- Handle resize during play ---
  function onResize() {
    if (!playing || !gameCamera || !rendererRef) return;
    var w = rendererRef.domElement.clientWidth;
    var h = rendererRef.domElement.clientHeight;
    gameCamera.aspect = w / h;
    gameCamera.updateProjectionMatrix();
  }

  return {
    init: init,
    play: play,
    stop: stop,
    toggle: toggle,
    isPlaying: isPlaying,
    renderFrame: renderFrame,
    onResize: onResize
  };
})();
