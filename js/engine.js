// ============================================================
// ENGINE — Object registry + CRUD API for scene management
// ============================================================

var Engine = (function() {
  'use strict';

  var threeScene = null;
  var sceneData = null;
  var registry = {};  // id -> { data, meshGroup }
  var builders = {};  // type -> builder function

  function init(scene, data) {
    threeScene = scene;
    sceneData = data;
    registry = {};
  }

  // --- Generic builder registration ---
  function registerBuilder(type, fn) {
    builders[type] = fn;
  }

  // --- Generic CRUD ---
  function addObject(type, data) {
    if (!data.id) data.id = SceneID.next(type);
    data.primitive = type;
    // Ensure faces, behaviors, scripts
    if (!data.faces) data.faces = {};
    if (!data.behaviors) data.behaviors = [];
    if (!data.scripts) data.scripts = [];
    var group = null;
    if (builders[type]) {
      try {
        group = builders[type](data);
      } catch (e) {
        console.error('[Engine] Builder error for ' + type + ' (' + data.id + '):', e);
      }
    }
    if (group) threeScene.add(group);
    register(data.id, data, group);
    return data.id;
  }

  function removeObject(id) {
    unregister(id);
  }

  function updateObject(id, newData) {
    var entry = registry[id];
    if (!entry) return;
    if (entry.meshGroup) {
      disposeGroup(entry.meshGroup);
      threeScene.remove(entry.meshGroup);
    }
    for (var key in newData) {
      entry.data[key] = newData[key];
    }
    var type = entry.data.primitive;
    var group = null;
    if (builders[type]) {
      try {
        group = builders[type](entry.data);
      } catch (e) {
        console.error('[Engine] Update builder error for ' + type + ' (' + id + '):', e);
      }
    }
    if (group) threeScene.add(group);
    entry.meshGroup = group;
  }

  // --- Registry helpers ---
  function register(id, data, meshGroup) {
    registry[id] = { data: data, meshGroup: meshGroup };
  }

  function unregister(id) {
    var entry = registry[id];
    if (entry) {
      if (entry.meshGroup) {
        disposeGroup(entry.meshGroup);
        if (entry.meshGroup.parent) entry.meshGroup.parent.remove(entry.meshGroup);
      }
      delete registry[id];
    }
  }

  function getEntry(id) {
    return registry[id] || null;
  }

  function getAllEntries() {
    return registry;
  }

  // --- Group helpers ---
  function getGroupMembers(groupId) {
    var members = [];
    for (var id in registry) {
      if (registry[id].data.groupId === groupId) {
        members.push(registry[id]);
      }
    }
    return members;
  }

  function getGroupMemberIds(groupId) {
    var ids = [];
    for (var id in registry) {
      if (registry[id].data.groupId === groupId) {
        ids.push(id);
      }
    }
    return ids;
  }

  // --- Dispose helper: clean up geometries + materials recursively ---
  function disposeGroup(group) {
    group.traverse(function(child) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          for (var i = 0; i < child.material.length; i++) {
            disposeMaterial(child.material[i]);
          }
        } else {
          disposeMaterial(child.material);
        }
      }
    });
  }

  function disposeMaterial(mat) {
    if (mat._cached) return;
    if (mat._shared) return;
    if (mat.map && !mat.map._shared) mat.map.dispose();
    if (mat.normalMap && !mat.normalMap._shared) mat.normalMap.dispose();
    if (mat.emissiveMap && !mat.emissiveMap._shared) mat.emissiveMap.dispose();
    mat.dispose();
  }

  // --- World settings ---
  function setWorldSettings(data) {
    if (!sceneData) return;
    if (data.world) {
      for (var key in data.world) sceneData.world[key] = data.world[key];
    }
    if (data.spawn) {
      for (var key in data.spawn) sceneData.spawn[key] = data.spawn[key];
    }
    if (data.colors) {
      for (var key in data.colors) sceneData.colors[key] = data.colors[key];
    }
  }

  // --- Rebuild collision from current scene data ---
  function rebuildCollision() {
    if (typeof Collision !== 'undefined' && Collision.buildFromScene) {
      Collision.buildFromScene(sceneData);
    }
  }

  // --- Get deep-clone of current scene data ---
  function getSceneData() {
    return JSON.parse(JSON.stringify(sceneData));
  }

  // --- Get live reference to scene data (for world settings editing) ---
  function getSceneDataRef() {
    return sceneData;
  }

  // --- Build all objects for editor from flat objects array ---
  function buildAllEditor() {
    if (!sceneData) {
      console.warn('[Engine] buildAllEditor: no sceneData');
      return;
    }

    var builderCount = 0;
    for (var bt in builders) builderCount++;
    console.log('[Engine] buildAllEditor: ' + builderCount + ' builders registered');

    var objects = sceneData.objects;
    if (!objects) {
      console.log('[Engine] buildAllEditor: no objects array');
      return;
    }

    var totalBuilt = 0;
    for (var i = 0; i < objects.length; i++) {
      var src = objects[i];
      var data = {};
      for (var key in src) data[key] = src[key];

      var type = data.primitive;
      if (!type) continue;

      // Backward-compat: migrate old single rot → rotY
      if (data.rot !== undefined && data.rotY === undefined) {
        data.rotY = data.rot;
        delete data.rot;
      }

      if (!data.id) data.id = SceneID.next(type);
      SceneSchema.applyDefaults(type, data);

      // Parse color strings in faces
      if (data.faces) {
        for (var fk in data.faces) {
          var face = data.faces[fk];
          if (face.color && typeof face.color === 'string') {
            face.color = SceneSchema.parseColor(face.color);
          }
          if (face.emissive && typeof face.emissive === 'string') {
            face.emissive = SceneSchema.parseColor(face.emissive);
          }
        }
      }

      addObject(type, data);
      totalBuilt++;
    }
    console.log('[Engine] buildAllEditor: built ' + totalBuilt + ' objects');
  }

  // --- Register default builders (called after BuilderSingle is loaded) ---
  function registerDefaultBuilders() {
    if (typeof BuilderSingle === 'undefined') return;
    registerBuilder('box',      BuilderSingle.buildBox);
    registerBuilder('cylinder', BuilderSingle.buildCylinder);
    registerBuilder('sphere',   BuilderSingle.buildSphere);
    registerBuilder('plane',    BuilderSingle.buildPlane);
    registerBuilder('cone',     BuilderSingle.buildCone);
    registerBuilder('wedge',    BuilderSingle.buildWedge);
    registerBuilder('torus',    BuilderSingle.buildTorus);
    registerBuilder('stairs',   BuilderSingle.buildStairs);
    registerBuilder('terrain',  BuilderSingle.buildTerrain);
    registerBuilder('road',     BuilderSingle.buildRoad);
    registerBuilder('empty',    BuilderSingle.buildEmpty);
  }

  // Auto-register builders if BuilderSingle is already available
  registerDefaultBuilders();

  return {
    init: init,
    getEntry: getEntry,
    getAllEntries: getAllEntries,
    register: register,
    unregister: unregister,
    disposeGroup: disposeGroup,
    getGroupMembers: getGroupMembers,
    getGroupMemberIds: getGroupMemberIds,
    registerBuilder: registerBuilder,
    registerDefaultBuilders: registerDefaultBuilders,
    addObject: addObject,
    removeObject: removeObject,
    updateObject: updateObject,
    setWorldSettings: setWorldSettings,
    rebuildCollision: rebuildCollision,
    getSceneData: getSceneData,
    getSceneDataRef: getSceneDataRef,
    buildAllEditor: buildAllEditor
  };
})();
