// ============================================================
// SCENE-LOADER — Loads scene.json (format v2: flat objects)
// ============================================================

if (typeof XJ === 'undefined') { var XJ = {}; }

var SceneLoader = (function() {
  'use strict';

  var sceneData = null;

  // Parse hex color string to integer
  function pc(val) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseInt(val.replace(/^#/, '0x'), 16);
    return 0;
  }

  // Populate minimal XJ globals from scene data (for controls/fog/spawn)
  function populateXJ(data) {
    if (data.colors) {
      if (!XJ.COLORS) XJ.COLORS = {};
      for (var key in data.colors) {
        XJ.COLORS[key] = pc(data.colors[key]);
      }
    }
    if (data.player) {
      XJ.PLAYER = {
        height:     data.player.height || 1.7,
        eyeHeight:  data.player.eyeHeight,
        radius:     data.player.radius,
        walkSpeed:  data.player.walkSpeed,
        sprintSpeed:data.player.sprintSpeed
      };
    }
    if (data.world) {
      XJ.WORLD = { width: data.world.width, depth: data.world.depth };
    }
    if (data.spawn) {
      XJ.SPAWN = { x: data.spawn.x, z: data.spawn.z, rot: data.spawn.rot || 0 };
    }
  }

  // Apply spawn override from localStorage (set by change-scene action)
  function applySpawnOverride(data) {
    try {
      var spawnStr = localStorage.getItem('xj_scene_spawn');
      if (spawnStr) {
        var override = JSON.parse(spawnStr);
        if (data.spawn) {
          if (override.x !== undefined) data.spawn.x = override.x;
          if (override.z !== undefined) data.spawn.z = override.z;
          if (override.rot !== undefined) data.spawn.rot = override.rot;
        }
        localStorage.removeItem('xj_scene_spawn');
        console.log('[SceneLoader] Applied spawn override:', override);
      }
    } catch(e) {}
  }

  // Load scene data from URL or localStorage preview
  function load(url, callback) {
    // Check for scene file override from change-scene action
    try {
      var sceneFileOverride = localStorage.getItem('xj_scene_file');
      if (sceneFileOverride) {
        url = sceneFileOverride;
        localStorage.removeItem('xj_scene_file');
        console.log('[SceneLoader] Scene override:', url);
      }
    } catch(e) {}

    // Check localStorage preview first (editor -> game bridge)
    var preview = null;
    try {
      preview = localStorage.getItem('xj_scene_preview');
    } catch(e) {}

    if (preview) {
      try {
        var data = JSON.parse(preview);
        applySpawnOverride(data);
        sceneData = data;
        SceneID.init(data);
        populateXJ(data);
        console.log('[SceneLoader] Loaded from localStorage preview');
        if (callback) callback(null, data);
        return;
      } catch(e) {
        console.warn('[SceneLoader] Invalid localStorage preview, falling back to file');
      }
    }

    // XHR fetch
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          applySpawnOverride(data);
          sceneData = data;
          SceneID.init(data);
          populateXJ(data);
          console.log('[SceneLoader] Loaded scene (v' + (data.formatVersion || '?') + ') from', url);
          if (callback) callback(null, data);
        } catch(e) {
          console.error('[SceneLoader] Parse error:', e);
          if (callback) callback(e);
        }
      } else {
        console.warn('[SceneLoader] ' + url + ' not found (status ' + xhr.status + ')');
        if (callback) callback(null, null);
      }
    };
    xhr.onerror = function() {
      console.warn('[SceneLoader] Network error loading ' + url);
      if (callback) callback(null, null);
    };
    xhr.send();
  }

  return {
    load: load,
    populateXJ: populateXJ,
    getSceneData: function() { return sceneData; },
    parseColor: pc
  };
})();
