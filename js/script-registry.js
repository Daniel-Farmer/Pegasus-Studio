// ============================================================
// SCRIPT-REGISTRY — Event-action scripting system (core runtime)
// Shared between editor (for UI metadata) and game (for execution)
// ============================================================

var ScriptRegistry = (function() {
  'use strict';

  // --- Event definitions (editor reads labels + param schemas) ---
  var EVENTS = {
    'interact':      { label: 'Interact (click)',   params: [] },
    'enter-zone':    { label: 'Enter Zone',         params: [] },
    'exit-zone':     { label: 'Exit Zone',          params: [] },
    'on-collision':  { label: 'On Collision',       params: [] },
    'on-key-press':  { label: 'On Key Press',       params: [{ key: 'key', label: 'Key', type: 'text', default: 'e' }] },
    'timer':         { label: 'Timer',              params: [{ key: 'interval', label: 'Interval (s)', type: 'number', default: 5 }] },
    'scene-ready':   { label: 'Scene Ready',        params: [] }
  };

  // --- Action definitions ---
  var ACTIONS = {
    'teleport':           { label: 'Teleport',           params: [
      { key: 'x', label: 'X', type: 'number', default: 0 },
      { key: 'y', label: 'Y', type: 'number', default: 1.6 },
      { key: 'z', label: 'Z', type: 'number', default: 0 }
    ]},
    'show-dialog':        { label: 'Show Dialog',        params: [
      { key: 'title',    label: 'Title',       type: 'text',   default: '' },
      { key: 'text',     label: 'Text',        type: 'text',   default: '' },
      { key: 'duration', label: 'Duration (s)', type: 'number', default: 3 }
    ]},
    'play-sound':         { label: 'Play Sound',         params: [
      { key: 'src',    label: 'Source URL', type: 'text',   default: '' },
      { key: 'volume', label: 'Volume',     type: 'number', default: 1 }
    ]},
    'set-variable':       { label: 'Set Variable',       params: [
      { key: 'name',  label: 'Name',  type: 'text', default: '' },
      { key: 'value', label: 'Value', type: 'text', default: '' }
    ]},
    'toggle-visibility':  { label: 'Toggle Visibility',  params: [
      { key: 'target',  label: 'Object ID', type: 'text',     default: '' },
      { key: 'visible', label: 'Visible',   type: 'checkbox', default: true }
    ]},
    'move-object':        { label: 'Move Object',        params: [
      { key: 'target', label: 'Object ID', type: 'text',   default: '' },
      { key: 'x',      label: 'X',         type: 'number', default: 0 },
      { key: 'y',      label: 'Y',         type: 'number', default: 0 },
      { key: 'z',      label: 'Z',         type: 'number', default: 0 },
      { key: 'duration', label: 'Duration (s)', type: 'number', default: 1 },
      { key: 'relative', label: 'Relative', type: 'checkbox', default: true }
    ]},
    'destroy-object':     { label: 'Destroy Object',     params: [
      { key: 'target', label: 'Object ID', type: 'text', default: '' }
    ]},
    'change-scene':       { label: 'Change Scene',       params: [
      { key: 'scene',  label: 'Scene File', type: 'text',   default: '' },
      { key: 'spawnX', label: 'Spawn X',    type: 'number', default: 0 },
      { key: 'spawnZ', label: 'Spawn Z',    type: 'number', default: 0 }
    ]},
    'animate-object':     { label: 'Animate Object',     params: [
      { key: 'target',   label: 'Object ID',  type: 'text',   default: '' },
      { key: 'property', label: 'Property',    type: 'select', default: 'rot', options: ['rot', 'y', 'opacity', 'scale'] },
      { key: 'to',       label: 'To Value',    type: 'number', default: 0 },
      { key: 'duration', label: 'Duration (s)', type: 'number', default: 1 }
    ]},
    'log':                { label: 'Log Message',        params: [
      { key: 'message', label: 'Message', type: 'text', default: '' }
    ]}
  };

  // --- Runtime state ---
  var sceneRef = null;
  var cameraRef = null;
  var registered = {};    // objectId -> { scripts: [], box3: Box3|null }
  var gameVars = {};      // global game variables
  var zoneState = {};     // objectId -> boolean (inside zone?)
  var collisionState = {};// objectId -> boolean (player colliding?)
  var timerState = {};    // objectId+idx -> { elapsed, interval }
  var keysDown = {};      // key -> boolean (lowercase)
  var keysFired = {};     // key -> boolean (consumed this frame)
  var animations = [];    // active move/animate tweens
  var dialogOverlay = null;
  var dialogTimeout = null;

  function init(scene, camera) {
    sceneRef = scene;
    cameraRef = camera;
    registered = {};
    gameVars = {};
    zoneState = {};
    collisionState = {};
    timerState = {};
    keysDown = {};
    keysFired = {};
    animations = [];
    dialogOverlay = document.getElementById('dialog-overlay');

    // Key tracking for on-key-press events
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      keysDown[e.key.toLowerCase()] = true;
    });
    document.addEventListener('keyup', function(e) {
      keysDown[e.key.toLowerCase()] = false;
      keysFired[e.key.toLowerCase()] = false;
    });
  }

  function registerScripts(objectId, scripts) {
    if (!scripts || scripts.length === 0) return;
    var entry = { scripts: scripts, box3: null };

    // Compute bounding box for zone/collision events
    var needsBox = false;
    for (var i = 0; i < scripts.length; i++) {
      var ev = scripts[i].event;
      if (ev === 'enter-zone' || ev === 'exit-zone' || ev === 'on-collision') {
        needsBox = true;
        break;
      }
    }
    if (needsBox && sceneRef) {
      entry.box3 = computeBox3(objectId);
    }

    // Init timers
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].event === 'timer') {
        var interval = (scripts[i].params && scripts[i].params.interval) || 5;
        timerState[objectId + '_' + i] = { elapsed: 0, interval: interval };
      }
    }

    registered[objectId] = entry;
  }

  function unregisterScripts(objectId) {
    delete registered[objectId];
    delete zoneState[objectId];
    // Clean timer states
    for (var key in timerState) {
      if (key.indexOf(objectId + '_') === 0) {
        delete timerState[key];
      }
    }
  }

  function computeBox3(objectId) {
    // Find mesh in scene by userData.sceneId
    var box = new THREE.Box3();
    var found = false;
    if (sceneRef) {
      sceneRef.traverse(function(child) {
        if (child.userData && child.userData.sceneId === objectId && child.isMesh) {
          box.expandByObject(child);
          found = true;
        }
        // Also check parent group
        if (child.userData && child.userData.sceneId === objectId && child.isGroup) {
          box.expandByObject(child);
          found = true;
        }
      });
    }
    return found ? box : null;
  }

  function fireEvent(objectId, eventName) {
    var entry = registered[objectId];
    if (!entry) return;
    for (var i = 0; i < entry.scripts.length; i++) {
      var script = entry.scripts[i];
      if (script.event === eventName) {
        // Check condition (if-variable guard)
        if (script.condition) {
          var condMet = checkCondition(script.condition);
          if (!condMet) continue;
        }
        // Execute action(s) — support both legacy single and chained array
        if (script.actions && script.actions.length > 0) {
          for (var ai = 0; ai < script.actions.length; ai++) {
            var act = script.actions[ai];
            executeAction(act.action, act.params || {});
          }
        } else if (script.action) {
          executeAction(script.action, script.params || {});
        }
      }
    }
  }

  function checkCondition(condition) {
    if (!condition || !condition.type) return true;
    if (condition.type === 'if-variable') {
      var current = gameVars[condition.name];
      var expected = condition.value;
      if (condition.op === '!=') return String(current) !== String(expected);
      if (condition.op === '>') return parseFloat(current) > parseFloat(expected);
      if (condition.op === '<') return parseFloat(current) < parseFloat(expected);
      if (condition.op === '>=') return parseFloat(current) >= parseFloat(expected);
      if (condition.op === '<=') return parseFloat(current) <= parseFloat(expected);
      return String(current) === String(expected); // default: ==
    }
    return true;
  }

  function fireSceneReady() {
    for (var id in registered) {
      fireEvent(id, 'scene-ready');
    }
  }

  function update(dt, playerPos) {
    for (var id in registered) {
      var entry = registered[id];
      for (var i = 0; i < entry.scripts.length; i++) {
        var script = entry.scripts[i];

        // Timer events
        if (script.event === 'timer') {
          var key = id + '_' + i;
          var ts = timerState[key];
          if (ts) {
            ts.elapsed += dt;
            if (ts.elapsed >= ts.interval) {
              ts.elapsed -= ts.interval;
              fireScriptAction(script);
            }
          }
        }

        // Zone events
        if ((script.event === 'enter-zone' || script.event === 'exit-zone') && entry.box3 && playerPos) {
          var inside = entry.box3.containsPoint(playerPos);
          var wasInside = !!zoneState[id];

          if (inside && !wasInside && script.event === 'enter-zone') {
            fireScriptAction(script);
          }
          if (!inside && wasInside && script.event === 'exit-zone') {
            fireScriptAction(script);
          }
        }

        // Collision events (proximity-based, fires once on enter)
        if (script.event === 'on-collision' && entry.box3 && playerPos) {
          var colliding = entry.box3.containsPoint(playerPos);
          var wasColliding = !!collisionState[id];
          if (colliding && !wasColliding) {
            fireScriptAction(script);
          }
        }

        // Key press events (fires once per keydown, not repeating)
        if (script.event === 'on-key-press') {
          var watchKey = (script.params && script.params.key) ? script.params.key.toLowerCase() : 'e';
          if (keysDown[watchKey] && !keysFired[watchKey]) {
            keysFired[watchKey] = true;
            fireScriptAction(script);
          }
        }
      }

      // Update zone/collision state (once per object, not per script)
      if (entry.box3 && playerPos) {
        zoneState[id] = entry.box3.containsPoint(playerPos);
        collisionState[id] = entry.box3.containsPoint(playerPos);
      }
    }

    // Tick active animations
    tickAnimations(dt);
  }

  // Fire a single script's action(s) with condition check
  function fireScriptAction(script) {
    if (script.condition && !checkCondition(script.condition)) return;
    if (script.actions && script.actions.length > 0) {
      for (var i = 0; i < script.actions.length; i++) {
        executeAction(script.actions[i].action, script.actions[i].params || {});
      }
    } else if (script.action) {
      executeAction(script.action, script.params || {});
    }
  }

  // --- Action execution ---
  function executeAction(actionName, params) {
    switch (actionName) {
      case 'teleport':          doTeleport(params); break;
      case 'show-dialog':       doShowDialog(params); break;
      case 'play-sound':        doPlaySound(params); break;
      case 'set-variable':      doSetVariable(params); break;
      case 'toggle-visibility': doToggleVisibility(params); break;
      case 'move-object':       doMoveObject(params); break;
      case 'destroy-object':    doDestroyObject(params); break;
      case 'change-scene':      doChangeScene(params); break;
      case 'animate-object':    doAnimateObject(params); break;
      case 'log':               doLog(params); break;
      default:
        console.warn('[ScriptRegistry] Unknown action: ' + actionName);
    }
  }

  function doTeleport(params) {
    if (!cameraRef) return;
    var x = parseFloat(params.x) || 0;
    var y = parseFloat(params.y) || 1.6;
    var z = parseFloat(params.z) || 0;
    cameraRef.position.set(x, y, z);
    console.log('[Script] Teleport to', x, y, z);
  }

  function doShowDialog(params) {
    var title = params.title || '';
    var text = params.text || '';
    var duration = parseFloat(params.duration) || 3;

    if (dialogOverlay) {
      var titleEl = dialogOverlay.querySelector('.dialog-title');
      var textEl = dialogOverlay.querySelector('.dialog-text');
      if (titleEl) titleEl.textContent = title;
      if (textEl) textEl.textContent = text;
      dialogOverlay.style.display = 'flex';

      if (dialogTimeout) clearTimeout(dialogTimeout);
      dialogTimeout = setTimeout(function() {
        dialogOverlay.style.display = 'none';
      }, duration * 1000);
    }
    console.log('[Script] Dialog:', title, '-', text);
  }

  function doPlaySound(params) {
    var src = params.src || '';
    var volume = parseFloat(params.volume);
    if (isNaN(volume)) volume = 1;
    if (!src) return;
    try {
      var audio = new Audio(src);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(function(e) {
        console.warn('[Script] Audio play failed:', e.message);
      });
    } catch(e) {
      console.warn('[Script] Audio error:', e.message);
    }
  }

  function doSetVariable(params) {
    var name = params.name || '';
    if (!name) return;
    gameVars[name] = params.value;
    console.log('[Script] Set var', name, '=', params.value);
  }

  function doToggleVisibility(params) {
    var target = params.target || '';
    var visible = params.visible !== false && params.visible !== 'false';
    if (!target || !sceneRef) return;

    sceneRef.traverse(function(child) {
      if (child.userData && child.userData.sceneId === target) {
        child.visible = visible;
      }
    });
    console.log('[Script] Visibility', target, '=', visible);
  }

  function doMoveObject(params) {
    var target = params.target || '';
    if (!target || !sceneRef) return;
    var duration = parseFloat(params.duration) || 1;
    var dx = parseFloat(params.x) || 0;
    var dy = parseFloat(params.y) || 0;
    var dz = parseFloat(params.z) || 0;
    var relative = params.relative !== false && params.relative !== 'false';

    sceneRef.traverse(function(child) {
      if (child.userData && child.userData.sceneId === target && child.parent === sceneRef) {
        var startX = child.position.x;
        var startY = child.position.y;
        var startZ = child.position.z;
        var endX = relative ? startX + dx : dx;
        var endY = relative ? startY + dy : dy;
        var endZ = relative ? startZ + dz : dz;

        animations.push({
          type: 'move',
          target: child,
          targetId: target,
          startX: startX, startY: startY, startZ: startZ,
          endX: endX, endY: endY, endZ: endZ,
          duration: duration,
          elapsed: 0
        });
      }
    });
    console.log('[Script] Move', target, 'by', dx, dy, dz, 'over', duration + 's');
  }

  function doDestroyObject(params) {
    var target = params.target || '';
    if (!target) return;
    if (typeof Engine !== 'undefined' && Engine.unregister) {
      Engine.unregister(target);
    }
    unregisterScripts(target);
    console.log('[Script] Destroyed', target);
  }

  function doChangeScene(params) {
    var sceneFile = params.scene || '';
    if (!sceneFile) return;
    console.log('[Script] Change scene to', sceneFile);

    // Store spawn override in localStorage for the new scene
    var spawnOverride = {};
    if (params.spawnX) spawnOverride.x = parseFloat(params.spawnX);
    if (params.spawnZ) spawnOverride.z = parseFloat(params.spawnZ);
    try {
      localStorage.setItem('xj_scene_spawn', JSON.stringify(spawnOverride));
      localStorage.setItem('xj_scene_file', sceneFile);
    } catch(e) {}

    // Reload the page with the new scene
    window.location.reload();
  }

  function doAnimateObject(params) {
    var target = params.target || '';
    if (!target || !sceneRef) return;
    var property = params.property || 'rot';
    var toVal = parseFloat(params.to) || 0;
    var duration = parseFloat(params.duration) || 1;

    sceneRef.traverse(function(child) {
      if (child.userData && child.userData.sceneId === target && child.parent === sceneRef) {
        var startVal;
        if (property === 'rot') startVal = child.rotation.y;
        else if (property === 'y') startVal = child.position.y;
        else if (property === 'scale') startVal = child.scale.x;
        else if (property === 'opacity') {
          // Get opacity from first mesh child
          startVal = 1;
          child.traverse(function(m) {
            if (m.isMesh && m.material) startVal = m.material.opacity !== undefined ? m.material.opacity : 1;
          });
        }
        else return;

        animations.push({
          type: 'animate',
          target: child,
          targetId: target,
          property: property,
          startVal: startVal,
          endVal: toVal,
          duration: duration,
          elapsed: 0
        });
      }
    });
  }

  // --- Animation tween system ---
  function tickAnimations(dt) {
    for (var i = animations.length - 1; i >= 0; i--) {
      var anim = animations[i];
      anim.elapsed += dt;
      var t = Math.min(anim.elapsed / anim.duration, 1);
      // Ease in-out
      var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      if (anim.type === 'move') {
        anim.target.position.x = anim.startX + (anim.endX - anim.startX) * ease;
        anim.target.position.y = anim.startY + (anim.endY - anim.startY) * ease;
        anim.target.position.z = anim.startZ + (anim.endZ - anim.startZ) * ease;
        // Update engine data
        if (typeof Engine !== 'undefined') {
          var entry = Engine.getEntry(anim.targetId);
          if (entry && entry.data) {
            entry.data.x = anim.target.position.x;
            entry.data.y = anim.target.position.y;
            entry.data.z = anim.target.position.z;
          }
        }
      } else if (anim.type === 'animate') {
        var val = anim.startVal + (anim.endVal - anim.startVal) * ease;
        if (anim.property === 'rot') anim.target.rotation.y = val;
        else if (anim.property === 'y') anim.target.position.y = val;
        else if (anim.property === 'scale') anim.target.scale.set(val, val, val);
        else if (anim.property === 'opacity') {
          anim.target.traverse(function(m) {
            if (m.isMesh && m.material) {
              m.material.transparent = true;
              m.material.opacity = val;
              m.material.needsUpdate = true;
            }
          });
        }
      }

      if (t >= 1) animations.splice(i, 1);
    }
  }

  function doLog(params) {
    console.log('[Script]', params.message || '');
  }

  function getVariable(name) { return gameVars[name]; }
  function setVariable(name, value) { gameVars[name] = value; }

  return {
    EVENTS: EVENTS,
    ACTIONS: ACTIONS,
    init: init,
    registerScripts: registerScripts,
    unregisterScripts: unregisterScripts,
    fireEvent: fireEvent,
    fireSceneReady: fireSceneReady,
    update: update,
    getVariable: getVariable,
    setVariable: setVariable
  };
})();
