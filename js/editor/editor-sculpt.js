// ============================================================
// EDITOR-SCULPT — Top-down terrain sculpting tools
// (raise, lower, smooth, flatten)
// ============================================================

var EditorSculpt = (function() {
  'use strict';

  var activeTool = null; // null | 'raise' | 'lower' | 'smooth' | 'flatten'
  var painting = false;
  var brushRadius = 5;
  var brushStrength = 0.5;
  var previewRing = null;
  var sceneRef = null;
  var commitCallback = null;
  var flattenAnchorH = null; // height at brush center when flatten starts
  var lastBrushPos = null;   // last cursor position for continuous painting
  var paintInterval = null;  // interval ID for hold-to-paint
  var PAINT_RATE = 33;       // ms between continuous paint ticks (~30 FPS)

  function init(scene) {
    sceneRef = scene;
    // Create brush preview ring
    var ringPts = [];
    var segs = 48;
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    var ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    var ringMat = new THREE.LineBasicMaterial({ color: 0x66ff66, depthTest: false, transparent: true, opacity: 0.8 });
    previewRing = new THREE.Line(ringGeo, ringMat);
    previewRing.renderOrder = 1000;
    previewRing.visible = false;
    scene.add(previewRing);
  }

  function setTool(name) {
    if (painting) cancelPaint();
    activeTool = name || null;
    if (previewRing) previewRing.visible = !!activeTool;
    flattenAnchorH = null;
  }

  function getTool() { return activeTool; }
  function isActive() { return activeTool !== null; }
  function isPainting() { return painting; }

  function onCommit(fn) { commitCallback = fn; }

  function setBrushRadius(r) {
    brushRadius = Math.max(1, Math.min(50, r));
    updateRingScale();
  }
  function getBrushRadius() { return brushRadius; }

  function setBrushStrength(s) { brushStrength = Math.max(0.05, Math.min(1, s)); }
  function getBrushStrength() { return brushStrength; }

  function updateRingScale() {
    if (previewRing) previewRing.scale.set(brushRadius, 1, brushRadius);
  }

  function onMouseDown(worldPos) {
    if (!activeTool) return;
    painting = true;
    flattenAnchorH = null;
    lastBrushPos = worldPos;
    applyBrush(worldPos);
    startPaintLoop();
  }

  function onMouseMove(worldPos) {
    if (!painting) return;
    lastBrushPos = worldPos;
    movePreview(worldPos);
  }

  function onMouseUp() {
    if (!painting) return;
    stopPaintLoop();
    painting = false;
    flattenAnchorH = null;
    lastBrushPos = null;
    if (commitCallback) commitCallback();
  }

  function startPaintLoop() {
    stopPaintLoop();
    paintInterval = setInterval(function() {
      if (!painting || !lastBrushPos) return;
      applyBrush(lastBrushPos);
    }, PAINT_RATE);
  }

  function stopPaintLoop() {
    if (paintInterval) {
      clearInterval(paintInterval);
      paintInterval = null;
    }
  }

  function updatePreview(worldPos) {
    movePreview(worldPos);
  }

  function movePreview(worldPos) {
    if (!previewRing || !worldPos) return;
    previewRing.position.set(worldPos.x, 0.2, worldPos.z);
    updateRingScale();
    previewRing.visible = !!activeTool;
  }

  function cancel() {
    cancelPaint();
    setTool(null);
  }

  function cancelPaint() {
    stopPaintLoop();
    painting = false;
    flattenAnchorH = null;
    lastBrushPos = null;
  }

  // --- Core brush application ---
  function applyBrush(worldPos) {
    if (!worldPos) return;
    var entries = Engine.getAllEntries();
    for (var id in entries) {
      var entry = entries[id];
      if (!entry || !entry.data || entry.data.primitive !== 'terrain') continue;
      applyToTerrain(entry, worldPos);
    }
  }

  function applyToTerrain(entry, worldPos) {
    var data = entry.data;
    var group = entry.meshGroup;
    if (!group || !data.heights) {
      // Initialize heights array if missing
      if (!data.heights) {
        var count = (data.segments + 1) * (data.segments + 1);
        data.heights = new Array(count);
        for (var fi = 0; fi < count; fi++) data.heights[fi] = 0;
      }
    }

    var tx = data.x || 0;
    var tz = data.z || 0;
    var width = data.width || 100;
    var depth = data.depth || 100;
    var segs = data.segments || 64;
    var cols = segs + 1;
    var heights = data.heights;

    // Convert world pos to local terrain coords
    var localX = worldPos.x - tx + width / 2;
    var localZ = worldPos.z - tz + depth / 2;

    // Compute col/row range affected by brush
    var cellW = width / segs;
    var cellD = depth / segs;
    var minCol = Math.max(0, Math.floor((localX - brushRadius) / cellW));
    var maxCol = Math.min(segs, Math.ceil((localX + brushRadius) / cellW));
    var minRow = Math.max(0, Math.floor((localZ - brushRadius) / cellD));
    var maxRow = Math.min(segs, Math.ceil((localZ + brushRadius) / cellD));

    // For flatten: sample center height on first stroke
    if (activeTool === 'flatten' && flattenAnchorH === null) {
      var centerCol = Math.round(localX / cellW);
      var centerRow = Math.round(localZ / cellD);
      centerCol = Math.max(0, Math.min(segs, centerCol));
      centerRow = Math.max(0, Math.min(segs, centerRow));
      flattenAnchorH = heights[centerRow * cols + centerCol] || 0;
    }

    var modified = false;

    for (var row = minRow; row <= maxRow; row++) {
      for (var col = minCol; col <= maxCol; col++) {
        var vx = -width / 2 + col * cellW;
        var vz = -depth / 2 + row * cellD;
        var wx = vx + tx;
        var wz = vz + tz;
        var dx = wx - worldPos.x;
        var dz = wz - worldPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > brushRadius) continue;

        var falloff = 1 - dist / brushRadius;
        falloff = falloff * falloff; // quadratic falloff for smoother edges
        var idx = row * cols + col;
        var h = heights[idx] || 0;

        if (activeTool === 'raise') {
          h += brushStrength * falloff * 0.1;
        } else if (activeTool === 'lower') {
          h -= brushStrength * falloff * 0.1;
        } else if (activeTool === 'smooth') {
          var avg = getNeighborAverage(heights, row, col, cols, segs);
          h += (avg - h) * brushStrength * falloff * 0.2;
        } else if (activeTool === 'flatten') {
          h += (flattenAnchorH - h) * brushStrength * falloff * 0.2;
        }

        heights[idx] = h;
        modified = true;
      }
    }

    if (modified) {
      updateTerrainMesh(group, heights);
    }
  }

  function getNeighborAverage(heights, row, col, cols, segs) {
    var sum = 0;
    var count = 0;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var r = row + dr;
        var c = col + dc;
        if (r < 0 || r > segs || c < 0 || c > segs) continue;
        sum += heights[r * cols + c] || 0;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  function updateTerrainMesh(group, heights) {
    if (!group) return;
    var mesh = null;
    group.traverse(function(child) {
      if (child.isMesh && child.geometry && child.geometry.attributes.position && !child.userData.isHelper && !child.userData.isWireHelper) {
        mesh = child;
      }
    });
    if (!mesh) return;

    var pos = mesh.geometry.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      pos.setY(i, i < heights.length ? heights[i] : 0);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();

    // Update vertex colors
    if (typeof BuilderSingle !== 'undefined' && BuilderSingle.terrainVertexColors) {
      var colorData = BuilderSingle.terrainVertexColors(heights, pos.count);
      var colorAttr = mesh.geometry.attributes.color;
      if (colorAttr) {
        colorAttr.array.set(colorData);
        colorAttr.needsUpdate = true;
      } else {
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colorData, 3));
      }
    }
  }

  return {
    init: init,
    setTool: setTool,
    getTool: getTool,
    isActive: isActive,
    isPainting: isPainting,
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    updatePreview: updatePreview,
    cancel: cancel,
    setBrushRadius: setBrushRadius,
    getBrushRadius: getBrushRadius,
    setBrushStrength: setBrushStrength,
    getBrushStrength: getBrushStrength,
    onCommit: onCommit
  };
})();
