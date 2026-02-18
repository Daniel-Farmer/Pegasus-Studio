// ============================================================
// EDITOR-INTERIOR — Interior edit mode (ortho top-down)
// ============================================================

var EditorInterior = (function() {
  'use strict';

  var scene = null;
  var isActive = false;
  var currentInteriorId = null;

  function init(scn) {
    scene = scn;
  }

  function enterMode(interiorId) {
    currentInteriorId = interiorId;
    isActive = true;
    console.log('[EditorInterior] Entered interior edit mode for', interiorId);
    // Future: switch to orthographic top-down camera, show room/wall/door UI
  }

  function exitMode() {
    isActive = false;
    currentInteriorId = null;
    console.log('[EditorInterior] Exited interior edit mode');
  }

  function isInMode() { return isActive; }
  function getCurrentId() { return currentInteriorId; }

  return {
    init: init,
    enterMode: enterMode,
    exitMode: exitMode,
    isInMode: isInMode,
    getCurrentId: getCurrentId
  };
})();
