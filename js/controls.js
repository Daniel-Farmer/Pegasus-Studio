// ============================================================
// FIRST-PERSON CONTROLS — Desktop WASD+mouse, Mobile touch
// ============================================================

var FPControls = (function() {
  'use strict';

  var camera, domElement, sceneRef;
  var yaw = 0, pitch = 0;
  var keys = { forward:false, back:false, left:false, right:false, sprint:false, jump:false };
  var moveDir = new THREE.Vector3();
  var enabled = true;

  // Gravity / jumping state
  var velocityY = 0;
  var feetY = 0;         // player feet position (ground = 0)
  var onGround = true;
  var GRAVITY = -15;     // m/s^2
  var JUMP_VELOCITY = 6; // m/s upward
  var BODY_HEIGHT = 1.6; // collision body height (below eye)
  var pointerLocked = false;
  var interactRaycaster = new THREE.Raycaster();
  var INTERACT_RANGE = 10;
  var onDragStart, onDragMove, onDragEnd, onInteract;

  // Player config (populated from init config or XJ globals as fallback)
  var playerConfig = {
    eyeHeight: 1.6,
    walkSpeed: 4.0,
    sprintSpeed: 8.0,
    radius: 0.3,
    spawnX: 80,
    spawnZ: 50,
    spawnRot: 0
  };

  // Mobile touch state
  var leftTouch = null;   // movement joystick
  var rightTouch = null;  // look
  var leftStart = { x:0, y:0 };
  var rightPrev = { x:0, y:0 };
  var joystickDelta = { x:0, y:0 };
  var isMobile = false;

  // Joystick visual elements
  var joystickBase = null, joystickKnob = null;

  // Sensitivity
  var mouseSens = 0.002;
  var touchLookSens = 0.004;
  var joystickRadius = 50;

  function init(cam, el, scn, config) {
    camera = cam;
    domElement = el;
    sceneRef = scn || null;
    camera.rotation.order = 'YXZ';

    // Reset movement state
    enabled = true;
    velocityY = 0;
    onGround = true;
    pointerLocked = false;
    keys = { forward:false, back:false, left:false, right:false, sprint:false, jump:false };

    // Merge config (explicit params > XJ globals > defaults)
    if (config) {
      for (var k in config) playerConfig[k] = config[k];
      // Override gravity/jump if specified in player config
      if (config.gravity !== undefined) GRAVITY = -Math.abs(config.gravity);
      if (config.jumpSpeed !== undefined) JUMP_VELOCITY = config.jumpSpeed;
    } else if (typeof XJ !== 'undefined') {
      // Backward compat: read from XJ globals
      if (XJ.PLAYER) {
        playerConfig.eyeHeight = XJ.PLAYER.eyeHeight || playerConfig.eyeHeight;
        playerConfig.walkSpeed = XJ.PLAYER.walkSpeed || playerConfig.walkSpeed;
        playerConfig.sprintSpeed = XJ.PLAYER.sprintSpeed || playerConfig.sprintSpeed;
        playerConfig.radius = XJ.PLAYER.radius || playerConfig.radius;
      }
      if (XJ.SPAWN) {
        playerConfig.spawnX = XJ.SPAWN.x !== undefined ? XJ.SPAWN.x : playerConfig.spawnX;
        playerConfig.spawnZ = XJ.SPAWN.z !== undefined ? XJ.SPAWN.z : playerConfig.spawnZ;
        playerConfig.spawnRot = XJ.SPAWN.rot || playerConfig.spawnRot;
      }
    }

    isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Desktop events
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    if (!isMobile) {
      domElement.addEventListener('click', requestPointerLock, false);
      document.addEventListener('pointerlockchange', onPointerLockChange, false);
      document.addEventListener('mousemove', onMouseMove, false);
    }

    // Mouse drag fallback (when pointer lock unavailable or on click)
    var dragging = false, dragPrev = { x:0, y:0 };
    onDragStart = function(e) {
      if (!pointerLocked && e.button === 0) {
        dragging = true;
        dragPrev.x = e.clientX;
        dragPrev.y = e.clientY;
      }
    };
    onDragMove = function(e) {
      if (dragging && !pointerLocked) {
        var dx = e.clientX - dragPrev.x;
        var dy = e.clientY - dragPrev.y;
        dragPrev.x = e.clientX;
        dragPrev.y = e.clientY;
        yaw -= dx * mouseSens;
        pitch -= dy * mouseSens;
        pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, pitch));
      }
    };
    onDragEnd = function() { dragging = false; };
    domElement.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Mobile touch events
    if (isMobile) {
      domElement.addEventListener('touchstart', onTouchStart, { passive: false });
      domElement.addEventListener('touchmove', onTouchMove, { passive: false });
      domElement.addEventListener('touchend', onTouchEnd, { passive: false });
      domElement.addEventListener('touchcancel', onTouchEnd, { passive: false });

      // Create joystick visuals
      createJoystickVisuals();
    }

    // Interact click — raycast from screen center when pointer locked
    onInteract = function() {
      if (!pointerLocked || !sceneRef) return;
      interactRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      interactRaycaster.far = INTERACT_RANGE;
      var intersects = interactRaycaster.intersectObjects(sceneRef.children, true);
      for (var i = 0; i < intersects.length; i++) {
        var obj = intersects[i].object;
        while (obj) {
          if (obj.userData && obj.userData.sceneId) {
            ScriptRegistry.fireEvent(obj.userData.sceneId, 'interact');
            return;
          }
          obj = obj.parent;
        }
      }
    };
    domElement.addEventListener('click', onInteract);

    // Set initial rotation from spawn
    yaw = playerConfig.spawnRot;
    pitch = 0;

    // Set feetY from camera starting position so gravity starts correct
    feetY = camera.position.y - playerConfig.eyeHeight;
    BODY_HEIGHT = playerConfig.eyeHeight;
  }

  function createJoystickVisuals() {
    joystickBase = document.getElementById('joystick-base');
    joystickKnob = document.getElementById('joystick-knob');
  }

  function requestPointerLock() {
    if (domElement.requestPointerLock) {
      domElement.requestPointerLock();
    }
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === domElement;
  }

  function onMouseMove(e) {
    if (!pointerLocked) return;
    yaw -= e.movementX * mouseSens;
    pitch -= e.movementY * mouseSens;
    pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, pitch));
  }

  var keyMap = {
    'KeyW': 'forward', 'ArrowUp': 'forward',
    'KeyS': 'back', 'ArrowDown': 'back',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    'ShiftLeft': 'sprint', 'ShiftRight': 'sprint',
    'Space': 'jump'
  };

  function onKeyDown(e) {
    var k = keyMap[e.code];
    if (k) keys[k] = true;
  }

  function onKeyUp(e) {
    var k = keyMap[e.code];
    if (k) keys[k] = false;
  }

  // --- Touch handlers ---
  function onTouchStart(e) {
    e.preventDefault();
    var w = window.innerWidth;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.clientX < w * 0.5) {
        // Left side — movement joystick
        leftTouch = t.identifier;
        leftStart.x = t.clientX;
        leftStart.y = t.clientY;
        joystickDelta.x = 0;
        joystickDelta.y = 0;
        if (joystickBase) {
          joystickBase.style.display = 'block';
          joystickBase.style.left = (t.clientX - 60) + 'px';
          joystickBase.style.top = (t.clientY - 60) + 'px';
        }
        if (joystickKnob) {
          joystickKnob.style.left = '35px';
          joystickKnob.style.top = '35px';
        }
      } else {
        // Right side — look
        rightTouch = t.identifier;
        rightPrev.x = t.clientX;
        rightPrev.y = t.clientY;
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === leftTouch) {
        var dx = t.clientX - leftStart.x;
        var dy = t.clientY - leftStart.y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > joystickRadius) {
          dx = dx / dist * joystickRadius;
          dy = dy / dist * joystickRadius;
        }
        joystickDelta.x = dx / joystickRadius;
        joystickDelta.y = dy / joystickRadius;
        if (joystickKnob) {
          joystickKnob.style.left = (35 + dx) + 'px';
          joystickKnob.style.top = (35 + dy) + 'px';
        }
      }
      if (t.identifier === rightTouch) {
        var dx = t.clientX - rightPrev.x;
        var dy = t.clientY - rightPrev.y;
        rightPrev.x = t.clientX;
        rightPrev.y = t.clientY;
        yaw -= dx * touchLookSens;
        pitch -= dy * touchLookSens;
        pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, pitch));
      }
    }
  }

  function onTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === leftTouch) {
        leftTouch = null;
        joystickDelta.x = 0;
        joystickDelta.y = 0;
        if (joystickBase) joystickBase.style.display = 'none';
      }
      if (t.identifier === rightTouch) {
        rightTouch = null;
      }
    }
  }

  function update(dt, collisionFn) {
    if (!enabled) return;

    // Build input vector (forward = -Z in local space)
    var inputX = 0, inputZ = 0;

    // Keyboard input
    if (keys.forward) inputZ -= 1;
    if (keys.back)    inputZ += 1;
    if (keys.left)    inputX -= 1;
    if (keys.right)   inputX += 1;

    // Mobile joystick input (joystickDelta.y forward is negative Z)
    if (leftTouch !== null) {
      inputX += joystickDelta.x;
      inputZ += joystickDelta.y;
    }

    // Normalize if > 1
    var inputLen = Math.sqrt(inputX*inputX + inputZ*inputZ);
    if (inputLen > 1) { inputX /= inputLen; inputZ /= inputLen; }

    // Sprint on mobile if joystick pushed far
    var sprinting = keys.sprint || (leftTouch !== null && inputLen > 0.9);
    var speed = sprinting ? playerConfig.sprintSpeed : playerConfig.walkSpeed;

    // Transform by yaw
    var sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    var worldX = inputX * cosY + inputZ * sinY;
    var worldZ = -inputX * sinY + inputZ * cosY;

    var oldX = camera.position.x;
    var oldZ = camera.position.z;
    var newX = oldX + worldX * speed * dt;
    var newZ = oldZ + worldZ * speed * dt;

    // --- Gravity & Jumping ---
    // Jump input
    if (keys.jump && onGround) {
      velocityY = JUMP_VELOCITY;
      onGround = false;
    }
    keys.jump = false; // consume jump (one press = one jump)

    // Apply gravity
    velocityY += GRAVITY * dt;
    var newFeetY = feetY + velocityY * dt;

    // Ground detection
    var groundLevel = 0;
    if (typeof Collision !== 'undefined' && Collision.getGroundHeight) {
      groundLevel = Collision.getGroundHeight(newX, newZ, playerConfig.radius, feetY);
    }

    // Landing
    if (newFeetY <= groundLevel) {
      newFeetY = groundLevel;
      velocityY = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    // Ceiling check
    if (typeof Collision !== 'undefined' && Collision.getCeilingHeight) {
      var ceiling = Collision.getCeilingHeight(newX, newZ, playerConfig.radius, newFeetY, BODY_HEIGHT);
      var headY = newFeetY + BODY_HEIGHT;
      if (headY > ceiling) {
        newFeetY = ceiling - BODY_HEIGHT;
        if (velocityY > 0) velocityY = 0;
      }
    }

    feetY = newFeetY;

    // XZ collision resolution (now Y-aware)
    if (collisionFn) {
      var resolved = collisionFn(oldX, oldZ, newX, newZ, playerConfig.radius, feetY, BODY_HEIGHT);
      newX = resolved.x;
      newZ = resolved.z;
    }

    camera.position.x = newX;
    camera.position.z = newZ;
    camera.position.y = feetY + playerConfig.eyeHeight;

    // Apply rotation
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function setEnabled(v) { enabled = v; }

  function dispose() {
    enabled = false;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    if (onDragMove) document.removeEventListener('mousemove', onDragMove);
    if (onDragEnd) document.removeEventListener('mouseup', onDragEnd);
    if (domElement) {
      domElement.removeEventListener('click', requestPointerLock);
      if (onDragStart) domElement.removeEventListener('mousedown', onDragStart);
      if (onInteract) domElement.removeEventListener('click', onInteract);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    keys = { forward:false, back:false, left:false, right:false, sprint:false, jump:false };
    pointerLocked = false;
  }

  return {
    init: init,
    update: update,
    setEnabled: setEnabled,
    dispose: dispose,
    getConfig: function() { return playerConfig; }
  };
})();
