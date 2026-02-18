// ============================================================
// EDITOR-ROAD — Waypoint-based road drawing tool
// Click to place waypoints, double-click/Enter to finalize,
// Escape to cancel, Backspace to undo last point
// ============================================================

var EditorRoad = (function() {
  'use strict';

  var threeScene = null;
  var activeTool = null;   // null or 'road'
  var activeStyle = 'dirt';
  var activeWidth = 1.5;
  var activePavements = false;
  var points = [];          // THREE.Vector3 world positions
  var previewGroup = null;
  var lastMousePos = null;  // THREE.Vector3 for phantom segment
  var commitCallback = null;

  // Materials for preview
  var waypointMat = null;
  var stripMat = null;
  var phantomMat = null;
  var waypointGeo = null;

  function init(scene) {
    threeScene = scene;
    previewGroup = new THREE.Group();
    previewGroup.renderOrder = 900;
    threeScene.add(previewGroup);

    waypointMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, depthTest: false, transparent: true, opacity: 0.8 });
    stripMat = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false });
    phantomMat = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: false });
    waypointGeo = new THREE.SphereGeometry(0.2, 8, 6);
  }

  function setTool(style) {
    if (style === null || style === undefined) {
      activeTool = null;
      cancel();
      return;
    }
    activeTool = 'road';
    if (style && typeof style === 'string') activeStyle = style;
    points = [];
    lastMousePos = null;
    clearPreview();
  }

  function getTool() { return activeTool; }
  function isActive() { return activeTool === 'road'; }
  function isDrawing() { return activeTool === 'road' && points.length > 0; }

  function getStyle() { return activeStyle; }
  function setStyle(s) { activeStyle = s; rebuildPreview(); }
  function getWidth() { return activeWidth; }
  function setWidth(w) { activeWidth = w; rebuildPreview(); }
  function getPavements() { return activePavements; }
  function setPavements(v) { activePavements = !!v; }

  function onClick(worldPos) {
    if (!isActive()) return;
    var snapped = snap(worldPos);
    points.push(snapped);
    rebuildPreview();
  }

  function onDoubleClick() {
    if (!isActive() || points.length < 2) return;
    commitRoad();
  }

  function onMouseMove(worldPos) {
    if (!isActive()) return;
    lastMousePos = snap(worldPos);
    rebuildPreview();
  }

  function onKeyDown(e) {
    if (!isActive()) return false;

    if (e.key === 'Escape') {
      cancel();
      return true;
    }
    if (e.key === 'Enter') {
      if (points.length >= 2) commitRoad();
      return true;
    }
    if (e.key === 'Backspace') {
      if (points.length > 0) {
        points.pop();
        rebuildPreview();
      }
      return true;
    }
    return false;
  }

  function cancel() {
    points = [];
    lastMousePos = null;
    clearPreview();
  }

  function onCommit(fn) { commitCallback = fn; }

  function commitRoad() {
    if (points.length < 2) return;

    var origin = points[0];
    var relPoints = [];
    for (var i = 0; i < points.length; i++) {
      relPoints.push({
        x: points[i].x - origin.x,
        z: points[i].z - origin.z
      });
    }

    var styleInfo = (typeof BuilderSingle !== 'undefined' && BuilderSingle.ROAD_STYLES)
      ? BuilderSingle.ROAD_STYLES[activeStyle] : null;

    var data = {
      x: origin.x,
      y: 0.02,
      z: origin.z,
      points: relPoints,
      width: activeWidth,
      style: activeStyle,
      closed: false,
      pavements: activePavements,
      faces: {},
      behaviors: []
    };

    // Apply style color as face default
    if (styleInfo) {
      data.faces.all = { color: styleInfo.color, roughness: styleInfo.roughness };
    }

    var id = Engine.addObject('road', data);
    var ids = id ? [id] : [];

    // Reset drawing state
    points = [];
    lastMousePos = null;
    clearPreview();

    if (commitCallback) commitCallback(ids);
  }

  // --- Preview rendering ---

  function clearPreview() {
    if (!previewGroup) return;
    while (previewGroup.children.length > 0) {
      var child = previewGroup.children[0];
      previewGroup.remove(child);
      if (child.geometry && child.geometry !== waypointGeo) child.geometry.dispose();
      if (child.material && child.material !== waypointMat && child.material !== stripMat && child.material !== phantomMat) child.material.dispose();
    }
  }

  function rebuildPreview() {
    clearPreview();
    if (!isActive() || points.length === 0) return;

    // Waypoint spheres
    for (var i = 0; i < points.length; i++) {
      var dot = new THREE.Mesh(waypointGeo, waypointMat);
      dot.position.copy(points[i]);
      dot.position.y = 0.15;
      dot.renderOrder = 901;
      previewGroup.add(dot);
    }

    // Build preview points including phantom
    var previewPts = [];
    for (var j = 0; j < points.length; j++) {
      previewPts.push({ x: points[j].x, z: points[j].z });
    }
    if (lastMousePos && points.length >= 1) {
      previewPts.push({ x: lastMousePos.x, z: lastMousePos.z });
    }

    // Build strip mesh if 2+ points
    if (previewPts.length >= 2) {
      var stripGeo = buildPreviewStrip(previewPts, activeWidth);
      if (stripGeo) {
        var strip = new THREE.Mesh(stripGeo, stripMat);
        strip.position.y = 0.03;
        strip.renderOrder = 900;
        previewGroup.add(strip);
      }
    }
  }

  function buildPreviewStrip(pts, width) {
    var N = pts.length;
    if (N < 2) return null;
    var halfW = width / 2;
    var positions = [];
    var indices = [];

    for (var i = 0; i < N; i++) {
      var prev = (i > 0) ? pts[i - 1] : null;
      var next = (i < N - 1) ? pts[i + 1] : null;
      var dx1 = 0, dz1 = 0, dx2 = 0, dz2 = 0;
      if (prev) { dx1 = pts[i].x - prev.x; dz1 = pts[i].z - prev.z; }
      if (next) { dx2 = next.x - pts[i].x; dz2 = next.z - pts[i].z; }
      if (!prev) { dx1 = dx2; dz1 = dz2; }
      if (!next) { dx2 = dx1; dz2 = dz1; }
      var l1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
      var l2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      dx1 /= l1; dz1 /= l1; dx2 /= l2; dz2 /= l2;
      var ax = dx1 + dx2, az = dz1 + dz2;
      var al = Math.sqrt(ax * ax + az * az);
      if (al < 0.001) { ax = -dz1; az = dx1; al = 1; }
      ax /= al; az /= al;
      var px = -az, pz = ax;
      var segPx = -dz1, segPz = dx1;
      var dot = px * segPx + pz * segPz;
      var miterScale = halfW / Math.max(Math.abs(dot), 0.25);

      positions.push(pts[i].x + px * miterScale, 0, pts[i].z + pz * miterScale);
      positions.push(pts[i].x - px * miterScale, 0, pts[i].z - pz * miterScale);
    }

    for (var qi = 0; qi < N - 1; qi++) {
      var a = qi * 2, b = qi * 2 + 1, c = (qi + 1) * 2, d = (qi + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  function snap(worldPos) {
    if (typeof EditorGrid !== 'undefined') {
      return new THREE.Vector3(
        EditorGrid.snap(worldPos.x),
        0,
        EditorGrid.snap(worldPos.z)
      );
    }
    return worldPos.clone();
  }

  return {
    init: init,
    setTool: setTool,
    getTool: getTool,
    isActive: isActive,
    isDrawing: isDrawing,
    onClick: onClick,
    onDoubleClick: onDoubleClick,
    onMouseMove: onMouseMove,
    onKeyDown: onKeyDown,
    cancel: cancel,
    getStyle: getStyle,
    setStyle: setStyle,
    getWidth: getWidth,
    setWidth: setWidth,
    getPavements: getPavements,
    setPavements: setPavements,
    onCommit: onCommit
  };
})();
