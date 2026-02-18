// ============================================================
// MAIN — Three.js init, FB Instant Games lifecycle, game loop
// ============================================================

(function() {
  'use strict';

  var renderer, scene, camera, clock;
  var isFB = typeof FBInstant !== 'undefined';
  var started = false;

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  function initScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);

    // Set initial camera position from scene data
    var sdata = SceneLoader.getSceneData();
    var spawnX = 50, spawnZ = 50, eyeH = 1.6;

    if (sdata) {
      // Find spawn from objects with spawn behavior
      if (sdata.objects) {
        for (var i = 0; i < sdata.objects.length; i++) {
          var obj = sdata.objects[i];
          if (obj.behaviors) {
            for (var b = 0; b < obj.behaviors.length; b++) {
              if (obj.behaviors[b].type === 'spawn') {
                spawnX = obj.x || 50;
                spawnZ = obj.z || 50;
                break;
              }
            }
          }
        }
      }
      if (sdata.spawn) {
        spawnX = sdata.spawn.x || spawnX;
        spawnZ = sdata.spawn.z || spawnZ;
      }
      if (sdata.player) {
        eyeH = sdata.player.eyeHeight || eyeH;
      }
    }

    camera.position.set(spawnX, eyeH, spawnZ);
    clock = new THREE.Clock();
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function startGame() {
    if (started) return;
    started = true;

    initRenderer();
    initScene();

    // Build world
    World.build(scene);

    // Init controls with scene data config
    var sdata = SceneLoader.getSceneData();
    var controlsConfig = null;
    if (sdata) {
      controlsConfig = {};
      if (sdata.player) {
        controlsConfig.eyeHeight = sdata.player.eyeHeight;
        controlsConfig.walkSpeed = sdata.player.walkSpeed;
        controlsConfig.sprintSpeed = sdata.player.sprintSpeed;
        controlsConfig.radius = sdata.player.radius;
        if (sdata.player.gravity !== undefined) controlsConfig.gravity = sdata.player.gravity;
        if (sdata.player.jumpSpeed !== undefined) controlsConfig.jumpSpeed = sdata.player.jumpSpeed;
      }
      if (sdata.spawn) {
        controlsConfig.spawnX = sdata.spawn.x;
        controlsConfig.spawnZ = sdata.spawn.z;
        controlsConfig.spawnRot = sdata.spawn.rot || 0;
      }
    }
    FPControls.init(camera, renderer.domElement, scene, controlsConfig);

    // Init script registry and register all object scripts
    if (typeof ScriptRegistry !== 'undefined') {
      ScriptRegistry.init(scene, camera);
      if (sdata && sdata.objects) {
        for (var i = 0; i < sdata.objects.length; i++) {
          var obj = sdata.objects[i];
          if (obj.scripts && obj.scripts.length > 0 && obj.id) {
            ScriptRegistry.registerScripts(obj.id, obj.scripts);
          }
        }
      }
    }

    // Initialize positional audio for objects with sound behavior
    initSounds(scene, camera, sdata);

    // Resize handler
    window.addEventListener('resize', onResize, false);

    // Hide loading screen
    var loadScreen = document.getElementById('loading-screen');
    if (loadScreen) loadScreen.style.display = 'none';

    // Show crosshair
    var crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.style.display = 'block';

    // Log draw call count, start loop, fire scene-ready scripts
    requestAnimationFrame(function() {
      renderer.render(scene, camera);
      console.log('Draw calls:', renderer.info.render.calls);
      console.log('Triangles:', renderer.info.render.triangles);
      console.log('Geometries:', renderer.info.memory.geometries);
      animate();
      if (typeof ScriptRegistry !== 'undefined') ScriptRegistry.fireSceneReady();
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    FPControls.update(dt, Collision.resolve);
    if (typeof NPCSystem !== 'undefined') NPCSystem.update(dt);
    if (typeof ScriptRegistry !== 'undefined') ScriptRegistry.update(dt, camera.position);
    renderer.render(scene, camera);
  }

  // --- Positional audio for objects with sound behavior ---
  var audioListener = null;
  var positionalAudios = [];

  function initSounds(scn, cam, sdata) {
    if (!sdata || !sdata.objects) return;

    // Find objects with sound behaviors
    var soundObjects = [];
    for (var i = 0; i < sdata.objects.length; i++) {
      var obj = sdata.objects[i];
      if (!obj.behaviors) continue;
      for (var b = 0; b < obj.behaviors.length; b++) {
        if (obj.behaviors[b].type === 'sound' && obj.behaviors[b].src) {
          soundObjects.push({ obj: obj, sound: obj.behaviors[b] });
        }
      }
    }

    if (soundObjects.length === 0) return;

    // Create listener (attached to camera)
    audioListener = new THREE.AudioListener();
    cam.add(audioListener);

    var loader = new THREE.AudioLoader();

    for (var si = 0; si < soundObjects.length; si++) {
      var so = soundObjects[si];
      var sd = so.sound;

      var audio = new THREE.PositionalAudio(audioListener);
      audio.setRefDistance(sd.refDistance || 5);
      audio.setMaxDistance(sd.maxDistance || 50);
      audio.setLoop(sd.loop !== false);
      audio.setVolume(sd.volume !== undefined ? sd.volume : 1);

      // Find the object's group in the scene to attach audio
      var targetGroup = null;
      scn.traverse(function(child) {
        if (child.userData && child.userData.sceneId === so.obj.id) {
          targetGroup = child;
        }
      });

      if (targetGroup) {
        targetGroup.add(audio);
      } else {
        audio.position.set(so.obj.x || 0, so.obj.y || 0, so.obj.z || 0);
        scn.add(audio);
      }

      // Load audio file
      (function(audioObj, src, autoplay) {
        loader.load(src, function(buffer) {
          audioObj.setBuffer(buffer);
          if (autoplay !== false) {
            var ctx = audioListener.context;
            if (ctx.state === 'suspended') {
              var resumeAudio = function() {
                ctx.resume().then(function() {
                  if (!audioObj.isPlaying) audioObj.play();
                });
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('keydown', resumeAudio);
              };
              document.addEventListener('click', resumeAudio);
              document.addEventListener('keydown', resumeAudio);
            } else {
              audioObj.play();
            }
          }
        }, undefined, function(err) {
          console.warn('[Sound] Failed to load:', src, err);
        });
      })(audio, sd.src, sd.autoplay);

      positionalAudios.push(audio);
    }
    console.log('[Main] Initialized', positionalAudios.length, 'sound objects');
  }

  // --- Scene loading + FB Instant Games lifecycle ---
  function loadSceneAndStart() {
    SceneLoader.load('scene.json', function(err, data) {
      if (err) console.warn('[Main] Scene load error, using defaults');
      startGame();
    });
  }

  window.addEventListener('DOMContentLoaded', function() {
    if (isFB) {
      var fallbackTimer = setTimeout(function() {
        loadSceneAndStart();
      }, 3000);

      FBInstant.initializeAsync()
        .then(function() {
          FBInstant.setLoadingProgress(50);
          FBInstant.setLoadingProgress(100);
          return FBInstant.startGameAsync();
        })
        .then(function() {
          clearTimeout(fallbackTimer);
          loadSceneAndStart();
        })
        .catch(function(err) {
          console.error('FB init error:', err);
          clearTimeout(fallbackTimer);
          loadSceneAndStart();
        });
    } else {
      loadSceneAndStart();
    }
  });

  // Expose for debugging
  window.XJ_DEBUG = {
    getRenderer: function() { return renderer; },
    getScene: function() { return scene; },
    getCamera: function() { return camera; }
  };
})();
