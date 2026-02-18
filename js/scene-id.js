// ============================================================
// SCENE-ID — Monotonic ID generation with type prefixes
// ============================================================

var SceneID = (function() {
  'use strict';

  var counter = 0;

  // 5 primitive prefixes
  var PREFIXES = {
    box:      'box_',
    cylinder: 'cyl_',
    plane:    'pln_',
    sphere:   'sph_',
    cone:     'con_',
    wedge:    'wdg_',
    torus:    'tor_',
    stairs:   'str_',
    terrain:  'ter_',
    road:     'rd_',
    empty:    'emp_'
  };

  // Scan all existing IDs in flat objects array to set counter above max
  function init(sceneData) {
    counter = 0;
    if (sceneData.objects) {
      for (var i = 0; i < sceneData.objects.length; i++) {
        extractMax(sceneData.objects[i].id);
      }
    }
    if (sceneData.groups) {
      for (var i = 0; i < sceneData.groups.length; i++) {
        extractMax(sceneData.groups[i].id);
      }
    }
  }

  function extractMax(id) {
    if (!id || typeof id !== 'string') return;
    var parts = id.split('_');
    if (parts.length >= 2) {
      var num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num >= counter) {
        counter = num + 1;
      }
    }
  }

  function next(type) {
    var prefix = PREFIXES[type] || type + '_';
    var id = prefix + counter;
    counter++;
    return id;
  }

  function getCounter() {
    return counter;
  }

  return {
    init: init,
    next: next,
    getCounter: getCounter,
    PREFIXES: PREFIXES
  };
})();
