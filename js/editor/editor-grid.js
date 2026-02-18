// ============================================================
// EDITOR-GRID — Grid overlay + snap system
// ============================================================

var EditorGrid = (function() {
  'use strict';

  var gridHelper = null;
  var gridSize = 1;
  var snapEnabled = true;
  var scene = null;

  function init(scn, size) {
    scene = scn;
    gridSize = size || 1;
    createGrid();
  }

  function createGrid() {
    if (gridHelper) {
      scene.remove(gridHelper);
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
    }

    var worldW = (XJ.WORLD && XJ.WORLD.width) || 160;
    var worldD = (XJ.WORLD && XJ.WORLD.depth) || 100;
    var maxSize = Math.max(worldW, worldD);
    var divisions = Math.ceil(maxSize / gridSize);

    gridHelper = new THREE.GridHelper(maxSize, divisions, 0x444444, 0x333333);
    gridHelper.position.set(worldW / 2, 0.01, worldD / 2);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    scene.add(gridHelper);
  }

  function setSize(size) {
    gridSize = Math.max(0.25, Math.min(10, size));
    createGrid();
  }

  function getSize() { return gridSize; }

  function setSnapEnabled(enabled) {
    snapEnabled = enabled;
  }

  function isSnapEnabled() { return snapEnabled; }

  function snap(value) {
    if (!snapEnabled) return value;
    return Math.round(value / gridSize) * gridSize;
  }

  function snapVec3(vec) {
    return new THREE.Vector3(snap(vec.x), vec.y, snap(vec.z));
  }

  function setVisible(visible) {
    if (gridHelper) gridHelper.visible = visible;
  }

  function isVisible() {
    return gridHelper ? gridHelper.visible : true;
  }

  function toggleVisible() {
    setVisible(!isVisible());
    return isVisible();
  }

  return {
    init: init,
    setSize: setSize,
    getSize: getSize,
    setSnapEnabled: setSnapEnabled,
    isSnapEnabled: isSnapEnabled,
    snap: snap,
    snapVec3: snapVec3,
    setVisible: setVisible,
    isVisible: isVisible,
    toggleVisible: toggleVisible
  };
})();
