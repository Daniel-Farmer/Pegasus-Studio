// ============================================================
// EDITOR-PREFAB — Save/load reusable object templates (prefabs)
// Prefabs are stored in scene.json under "prefabs" key and
// also in localStorage for cross-session availability.
// ============================================================

var EditorPrefab = (function() {
  'use strict';

  var STORAGE_KEY = 'xj_prefabs';
  var prefabs = {}; // name -> { name, objects: [{ type, data }, ...] }

  function init() {
    // Load from localStorage
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) prefabs = JSON.parse(stored);
    } catch(e) {}

    // Merge from scene data if available
    var sd = Engine.getSceneDataRef ? Engine.getSceneDataRef() : null;
    if (sd && sd.prefabs) {
      for (var name in sd.prefabs) {
        if (!prefabs[name]) prefabs[name] = sd.prefabs[name];
      }
    }
  }

  // Save selected object as a prefab
  function saveFromSelection(name) {
    var id = EditorViewport.getSelectedId();
    if (!id) return null;

    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return null;

    var clone = JSON.parse(JSON.stringify(entry.data));
    var type = clone.primitive || 'box';

    // Store position as offset from origin (relative placement)
    var originX = clone.x || 0;
    var originY = clone.y || 0;
    var originZ = clone.z || 0;

    clone.x = 0;
    clone.y = 0;
    clone.z = 0;
    delete clone.id;

    prefabs[name] = {
      name: name,
      objects: [{ type: type, data: clone }]
    };

    persist();
    return prefabs[name];
  }

  // Save multiple objects (by IDs) as a prefab
  function saveMultiple(name, ids) {
    if (!ids || ids.length === 0) return null;

    // Find center of all objects
    var sumX = 0, sumY = 0, sumZ = 0, count = 0;
    var objects = [];

    for (var i = 0; i < ids.length; i++) {
      var entry = Engine.getEntry(ids[i]);
      if (!entry || !entry.data) continue;

      var clone = JSON.parse(JSON.stringify(entry.data));
      var type = clone.primitive || 'box';
      sumX += (clone.x || 0);
      sumY += (clone.y || 0);
      sumZ += (clone.z || 0);
      count++;
      delete clone.id;
      objects.push({ type: type, data: clone });
    }

    if (count === 0) return null;

    // Normalize all positions relative to center
    var cx = sumX / count;
    var cy = sumY / count;
    var cz = sumZ / count;
    for (var i = 0; i < objects.length; i++) {
      var d = objects[i].data;
      d.x = (d.x || 0) - cx;
      d.y = (d.y || 0) - cy;
      d.z = (d.z || 0) - cz;
    }

    prefabs[name] = { name: name, objects: objects };
    persist();
    return prefabs[name];
  }

  // Instantiate a prefab at a given position
  function instantiate(name, x, z) {
    var prefab = prefabs[name];
    if (!prefab || !prefab.objects) return [];

    var createdIds = [];

    for (var i = 0; i < prefab.objects.length; i++) {
      var obj = prefab.objects[i];
      var data = JSON.parse(JSON.stringify(obj.data));

      // Offset from placement position
      data.x = (data.x || 0) + (x || 0);
      data.z = (data.z || 0) + (z || 0);

      var newId = Engine.addObject(obj.type, data);
      if (newId) createdIds.push(newId);
    }

    return createdIds;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefabs));
    } catch(e) {}

    // Also update scene data if available
    var sd = Engine.getSceneDataRef ? Engine.getSceneDataRef() : null;
    if (sd) sd.prefabs = JSON.parse(JSON.stringify(prefabs));
  }

  function remove(name) {
    delete prefabs[name];
    persist();
  }

  function getAll() {
    return prefabs;
  }

  function getNames() {
    var names = [];
    for (var n in prefabs) names.push(n);
    names.sort();
    return names;
  }

  return {
    init: init,
    saveFromSelection: saveFromSelection,
    saveMultiple: saveMultiple,
    instantiate: instantiate,
    remove: remove,
    getAll: getAll,
    getNames: getNames
  };
})();
