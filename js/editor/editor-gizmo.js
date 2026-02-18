// ============================================================
// EDITOR-GIZMO — Move/Rotate + Resize gizmo (toggle on re-click)
// Box/sphere/plane: center-positioned. Cylinder: base-positioned Y.
// ============================================================

var EditorGizmo = (function() {
  'use strict';

  var scene = null;
  var camera = null;
  var canvas = null;
  var currentId = null;
  var mode = 'move'; // 'move' or 'resize'
  var onMoveCallback = null;
  var onRotateCallback = null;
  var onResizeCallback = null;

  // --- Move gizmo ---
  var translateGroup = null;
  var arrowMeshes = {};
  var activeAxis = null;
  var isDragging = false;
  var dragStart = new THREE.Vector3();
  var objectStartPos = new THREE.Vector3();

  var rotateGroup = null;
  var rotateRings = {};
  var isRotating = false;
  var rotateAxis = null;
  var rotateStartAngle = 0;
  var objectStartRotX = 0;
  var objectStartRotY = 0;
  var objectStartRotZ = 0;

  // --- Resize gizmo ---
  var resizeGroup = null;
  var resizeHandles = {};
  var isResizing = false;
  var resizeAxis = null;
  var resizeSign = 1;      // +1 for positive handle, -1 for negative
  var resizeStartVal = 0;
  var resizeStartData = {};

  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var dragPlane = new THREE.Plane();

  var AXIS_LENGTH = 3.0;
  var AXIS_COLORS = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff };
  var RING_RADIUS = 2.5;
  var HANDLE_SIZE = 0.22;

  // Which data keys map to each axis per primitive
  // half: true  → extent = val/2, center-positioned (shifts position on resize)
  // half: false → extent = val, base/edge-positioned (no position shift)
  // noNeg: true → skip the negative-direction handle
  var RESIZE_MAP = {
    box:      { x: { key: 'w', half: true }, y: { key: 'h', half: true }, z: { key: 'd', half: true } },
    cylinder: { x: { key: 'radiusBottom', half: false }, y: { key: 'height', half: false, noNeg: true }, z: { key: 'radiusBottom', half: false } },
    sphere:   { x: { key: 'radius', half: false }, y: { key: 'radius', half: false }, z: { key: 'radius', half: false } },
    plane:    { x: { key: 'w', half: true }, y: null, z: { key: 'h', half: true } },
    cone:     { x: { key: 'radiusBottom', half: false }, y: { key: 'height', half: false, noNeg: true }, z: { key: 'radiusBottom', half: false } },
    wedge:    { x: { key: 'w', half: true }, y: { key: 'h', half: false, noNeg: true }, z: { key: 'd', half: true } },
    torus:    { x: { key: 'radius', half: false }, y: { key: 'tube', half: false }, z: { key: 'radius', half: false } },
    stairs:   { x: { key: 'w', half: true }, y: { key: 'h', half: false, noNeg: true }, z: { key: 'd', half: false, noNeg: true } },
    empty:    {}
  };

  function init(scn, cam, cvs) {
    scene = scn;
    camera = cam;
    canvas = cvs;
    createTranslateGizmo();
    createRotateGizmo();
    createResizeGizmo();
    translateGroup.visible = false;
    rotateGroup.visible = false;
    resizeGroup.visible = false;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
  }

  function createTranslateGizmo() {
    translateGroup = new THREE.Group();
    translateGroup.renderOrder = 1000;

    var axes = ['x', 'y', 'z'];
    var rotations = [
      function(g) { g.rotateZ(-Math.PI / 2); g.translate(AXIS_LENGTH / 2, 0, 0); },
      function(g) { g.translate(0, AXIS_LENGTH / 2, 0); },
      function(g) { g.rotateX(Math.PI / 2); g.translate(0, 0, AXIS_LENGTH / 2); }
    ];
    var coneRotations = [
      function(g) { g.rotateZ(-Math.PI / 2); g.translate(AXIS_LENGTH + 0.3, 0, 0); },
      function(g) { g.translate(0, AXIS_LENGTH + 0.3, 0); },
      function(g) { g.rotateX(Math.PI / 2); g.translate(0, 0, AXIS_LENGTH + 0.3); }
    ];

    for (var i = 0; i < 3; i++) {
      var shaft = new THREE.CylinderGeometry(0.12, 0.12, AXIS_LENGTH, 8);
      rotations[i](shaft);
      var sMesh = new THREE.Mesh(shaft, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axes[i]], depthTest: false }));
      sMesh.userData.gizmoAxis = axes[i];
      translateGroup.add(sMesh);
      arrowMeshes[axes[i]] = sMesh;

      var cone = new THREE.ConeGeometry(0.25, 0.6, 8);
      coneRotations[i](cone);
      var cMesh = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axes[i]], depthTest: false }));
      cMesh.userData.gizmoAxis = axes[i];
      translateGroup.add(cMesh);
    }

    scene.add(translateGroup);
  }

  function createRotateGizmo() {
    rotateGroup = new THREE.Group();
    rotateGroup.renderOrder = 1000;

    // Red ring (X axis) — lies in YZ plane
    var xGeo = new THREE.TorusGeometry(RING_RADIUS, 0.12, 8, 48);
    xGeo.rotateY(Math.PI / 2);
    var xRing = new THREE.Mesh(xGeo, new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false }));
    xRing.userData.gizmoRotateAxis = 'x';
    rotateGroup.add(xRing);
    rotateRings.x = xRing;

    // Green ring (Y axis) — lies in XZ plane
    var yGeo = new THREE.TorusGeometry(RING_RADIUS, 0.12, 8, 48);
    yGeo.rotateX(Math.PI / 2);
    var yRing = new THREE.Mesh(yGeo, new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false }));
    yRing.userData.gizmoRotateAxis = 'y';
    rotateGroup.add(yRing);
    rotateRings.y = yRing;

    // Blue ring (Z axis) — lies in XY plane (default torus orientation)
    var zGeo = new THREE.TorusGeometry(RING_RADIUS, 0.12, 8, 48);
    var zRing = new THREE.Mesh(zGeo, new THREE.MeshBasicMaterial({ color: 0x4444ff, depthTest: false }));
    zRing.userData.gizmoRotateAxis = 'z';
    rotateGroup.add(zRing);
    rotateRings.z = zRing;

    scene.add(rotateGroup);
  }

  function createResizeGizmo() {
    resizeGroup = new THREE.Group();
    resizeGroup.renderOrder = 1000;

    var axes = ['x', 'y', 'z'];
    for (var i = 0; i < 3; i++) {
      var ax = axes[i];
      // Line along axis (scaled to span between handles)
      var lineGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);
      if (ax === 'x') { lineGeo.rotateZ(-Math.PI / 2); }
      else if (ax === 'z') { lineGeo.rotateX(Math.PI / 2); }
      var lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[ax], depthTest: false, transparent: true, opacity: 0.4 }));
      lineMesh.userData.resizeLine = ax;
      resizeGroup.add(lineMesh);

      // Positive handle (+extent)
      var posGeo = new THREE.BoxGeometry(HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE);
      var posMesh = new THREE.Mesh(posGeo, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[ax], depthTest: false }));
      posMesh.userData.resizeAxis = ax;
      posMesh.userData.resizeSign = 1;
      resizeGroup.add(posMesh);
      resizeHandles[ax + '+'] = posMesh;

      // Negative handle (-extent)
      var negGeo = new THREE.BoxGeometry(HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE);
      var negMesh = new THREE.Mesh(negGeo, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[ax], depthTest: false, transparent: true, opacity: 0.7 }));
      negMesh.userData.resizeAxis = ax;
      negMesh.userData.resizeSign = -1;
      resizeGroup.add(negMesh);
      resizeHandles[ax + '-'] = negMesh;
    }

    scene.add(resizeGroup);
  }

  // Get the extent for each axis based on primitive type and data
  function getExtent(d, axis) {
    var prim = d.primitive || 'box';
    var map = RESIZE_MAP[prim];
    if (!map || !map[axis]) return null;
    var info = map[axis];
    var val = d[info.key] || 1;
    return info.half ? val / 2 : val;
  }

  // Position resize handles at object extents
  function positionResizeHandles(d) {
    var prim = d.primitive || 'box';
    var map = RESIZE_MAP[prim];

    for (var i = 0; i < resizeGroup.children.length; i++) {
      var child = resizeGroup.children[i];
      var ax = child.userData.resizeAxis || child.userData.resizeLine;
      if (!ax) continue;

      var ext = getExtent(d, ax);
      if (ext === null) {
        child.visible = false;
        continue;
      }

      if (child.userData.resizeAxis !== undefined) {
        // Cube handle — position at ±extent
        var sign = child.userData.resizeSign || 1;

        // Hide negative handle if noNeg is set for this axis
        if (sign < 0 && map && map[ax] && map[ax].noNeg) {
          child.visible = false;
          continue;
        }
        child.visible = true;
        child.position.set(
          ax === 'x' ? ext * sign : 0,
          ax === 'y' ? ext * sign : 0,
          ax === 'z' ? ext * sign : 0
        );
      } else if (child.userData.resizeLine) {
        child.visible = true;
        // Line spanning between handles
        var hasNeg = !(map && map[ax] && map[ax].noNeg);
        if (hasNeg) {
          // Centered: spans from -extent to +extent
          child.position.set(0, 0, 0);
          child.scale.set(1, ext * 2, 1);
        } else {
          // One-sided: spans from 0 to +extent
          var half = ext / 2;
          child.position.set(
            ax === 'x' ? half : 0,
            ax === 'y' ? half : 0,
            ax === 'z' ? half : 0
          );
          child.scale.set(1, ext, 1);
        }
      }
    }
  }

  // All primitives: x/y/z is the center
  function attachTo(id) {
    currentId = id;
    if (!id) {
      hideAll();
      return;
    }
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) {
      hideAll();
      return;
    }
    var d = entry.data;
    var cx = d.x || 0;
    var cy = d.y || 0;
    var cz = d.z || 0;

    if (mode === 'move') {
      translateGroup.position.set(cx, cy, cz);
      rotateGroup.position.set(cx, cy + 0.2, cz);
      translateGroup.visible = true;
      rotateGroup.visible = true;
      resizeGroup.visible = false;
    } else {
      resizeGroup.position.set(cx, cy, cz);
      positionResizeHandles(d);
      resizeGroup.visible = true;
      translateGroup.visible = false;
      rotateGroup.visible = false;
    }
  }

  function hideAll() {
    translateGroup.visible = false;
    rotateGroup.visible = false;
    resizeGroup.visible = false;
  }

  function toggleMode() {
    mode = (mode === 'move') ? 'resize' : 'move';
    if (currentId) attachTo(currentId);
    return mode;
  }

  function getMode() { return mode; }

  function setMode(m) {
    mode = m;
    if (currentId) attachTo(currentId);
  }

  // --- Mouse events ---
  function getActiveCam() {
    return (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
  }

  function updateMouse(e) {
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    var activeCam = getActiveCam();
    updateMouse(e);
    raycaster.setFromCamera(mouse, activeCam);

    // Move mode: translate
    if (mode === 'move' && translateGroup.visible) {
      var hits = raycaster.intersectObjects(translateGroup.children, false);
      if (hits.length > 0 && hits[0].object.userData.gizmoAxis) {
        activeAxis = hits[0].object.userData.gizmoAxis;
        isDragging = true;
        objectStartPos.copy(translateGroup.position);
        var normal;
        if (activeAxis === 'y') {
          normal = new THREE.Vector3();
          activeCam.getWorldDirection(normal);
          normal.y = 0;
          normal.normalize();
        } else if (activeAxis === 'x') {
          normal = new THREE.Vector3(0, 0, 1);
        } else {
          normal = new THREE.Vector3(1, 0, 0);
        }
        dragPlane.setFromNormalAndCoplanarPoint(normal, translateGroup.position);
        raycaster.ray.intersectPlane(dragPlane, dragStart);
        e.stopPropagation();
        return;
      }
    }

    // Move mode: rotate (per-axis rings)
    if (mode === 'move' && rotateGroup.visible) {
      var hits = raycaster.intersectObjects(rotateGroup.children, false);
      if (hits.length > 0 && hits[0].object.userData.gizmoRotateAxis) {
        isRotating = true;
        rotateAxis = hits[0].object.userData.gizmoRotateAxis;
        var c = rotateGroup.position;
        var planeNormal;
        if (rotateAxis === 'x') planeNormal = new THREE.Vector3(1, 0, 0);
        else if (rotateAxis === 'y') planeNormal = new THREE.Vector3(0, 1, 0);
        else planeNormal = new THREE.Vector3(0, 0, 1);
        var rotatePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, c);
        var hitPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(rotatePlane, hitPoint);
        if (rotateAxis === 'x') rotateStartAngle = Math.atan2(hitPoint.z - c.z, hitPoint.y - c.y);
        else if (rotateAxis === 'y') rotateStartAngle = Math.atan2(hitPoint.x - c.x, hitPoint.z - c.z);
        else rotateStartAngle = Math.atan2(hitPoint.y - c.y, hitPoint.x - c.x);
        var entry = Engine.getEntry(currentId);
        if (entry && entry.data) {
          objectStartRotX = entry.data.rotX || 0;
          objectStartRotY = entry.data.rotY || 0;
          objectStartRotZ = entry.data.rotZ || 0;
        }
        e.stopPropagation();
        return;
      }
    }

    // Resize mode
    if (mode === 'resize' && resizeGroup.visible) {
      var hits = raycaster.intersectObjects(resizeGroup.children, false);
      if (hits.length > 0 && hits[0].object.userData.resizeAxis) {
        resizeAxis = hits[0].object.userData.resizeAxis;
        resizeSign = hits[0].object.userData.resizeSign || 1;
        isResizing = true;
        var entry = Engine.getEntry(currentId);
        if (entry && entry.data) {
          resizeStartData = JSON.parse(JSON.stringify(entry.data));
        }
        var normal;
        if (resizeAxis === 'y') {
          normal = new THREE.Vector3();
          activeCam.getWorldDirection(normal);
          normal.y = 0;
          normal.normalize();
        } else if (resizeAxis === 'x') {
          normal = new THREE.Vector3(0, 0, 1);
        } else {
          normal = new THREE.Vector3(1, 0, 0);
        }
        dragPlane.setFromNormalAndCoplanarPoint(normal, resizeGroup.position);
        raycaster.ray.intersectPlane(dragPlane, dragStart);
        e.stopPropagation();
        return;
      }
    }
  }

  function onMouseMove(e) {
    var activeCam = getActiveCam();
    updateMouse(e);

    // Move drag
    if (isDragging && activeAxis) {
      raycaster.setFromCamera(mouse, activeCam);
      var intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersect);
      var delta = intersect.sub(dragStart);
      var newPos = objectStartPos.clone();
      if (activeAxis === 'x') newPos.x += delta.x;
      else if (activeAxis === 'y') newPos.y += delta.y;
      else if (activeAxis === 'z') newPos.z += delta.z;
      newPos.x = EditorGrid.snap(newPos.x);
      newPos.y = EditorGrid.snap(newPos.y);
      newPos.z = EditorGrid.snap(newPos.z);
      translateGroup.position.copy(newPos);
      if (currentId) {
        var entry = Engine.getEntry(currentId);
        if (entry && entry.meshGroup) {
          entry.meshGroup.position.copy(newPos);
          rotateGroup.position.set(newPos.x, newPos.y + 0.2, newPos.z);
        }
      }
      e.stopPropagation();
      return;
    }

    // Rotate drag (per-axis)
    if (isRotating && rotateAxis) {
      raycaster.setFromCamera(mouse, activeCam);
      var c = rotateGroup.position;
      var planeNormal;
      if (rotateAxis === 'x') planeNormal = new THREE.Vector3(1, 0, 0);
      else if (rotateAxis === 'y') planeNormal = new THREE.Vector3(0, 1, 0);
      else planeNormal = new THREE.Vector3(0, 0, 1);
      var rotatePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, c);
      var hitPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(rotatePlane, hitPoint);
      var currentAngle;
      if (rotateAxis === 'x') currentAngle = Math.atan2(hitPoint.z - c.z, hitPoint.y - c.y);
      else if (rotateAxis === 'y') currentAngle = Math.atan2(hitPoint.x - c.x, hitPoint.z - c.z);
      else currentAngle = Math.atan2(hitPoint.y - c.y, hitPoint.x - c.x);
      var deltaAngle = currentAngle - rotateStartAngle;
      var startRot = rotateAxis === 'x' ? objectStartRotX : rotateAxis === 'y' ? objectStartRotY : objectStartRotZ;
      var newRot = startRot + deltaAngle;
      if (EditorGrid.isSnapEnabled()) {
        newRot = Math.round(newRot / (Math.PI / 12)) * (Math.PI / 12);
      }
      if (currentId) {
        var entry = Engine.getEntry(currentId);
        if (entry && entry.meshGroup) {
          var rx = rotateAxis === 'x' ? newRot : (entry.data.rotX || 0);
          var ry = rotateAxis === 'y' ? newRot : (entry.data.rotY || 0);
          var rz = rotateAxis === 'z' ? newRot : (entry.data.rotZ || 0);
          entry.meshGroup.rotation.set(rx, ry, rz);
        }
      }
      e.stopPropagation();
      return;
    }

    // Resize drag
    if (isResizing && resizeAxis) {
      raycaster.setFromCamera(mouse, activeCam);
      var intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersect);
      var delta = intersect.sub(dragStart);
      var axisDelta = resizeAxis === 'x' ? delta.x : resizeAxis === 'y' ? delta.y : delta.z;
      axisDelta = EditorGrid.snap(axisDelta);

      var entry = Engine.getEntry(currentId);
      if (!entry || !entry.data) return;
      var d = entry.data;
      var prim = d.primitive || 'box';
      var map = RESIZE_MAP[prim];
      if (!map || !map[resizeAxis]) return;
      var info = map[resizeAxis];

      // effectiveDelta: positive when dragging AWAY from center, negative toward
      var effectiveDelta = axisDelta * resizeSign;
      var origVal = resizeStartData[info.key] || 1;
      var newVal = origVal + effectiveDelta;
      newVal = Math.max(0.05, newVal);
      newVal = EditorGrid.snap(newVal);
      d[info.key] = newVal;

      // Shift center so the opposite face stays anchored (center-positioned axes only)
      if (info.half) {
        var origPos = resizeStartData[resizeAxis] || 0;
        d[resizeAxis] = origPos + axisDelta / 2;
      }

      // Update gizmo position to follow the shifted center
      resizeGroup.position.set(d.x || 0, d.y || 0, d.z || 0);

      // Live rebuild
      if (onResizeCallback) {
        onResizeCallback(currentId);
      }

      // Update handle positions
      positionResizeHandles(d);
      e.stopPropagation();
      return;
    }
  }

  function onMouseUp(e) {
    if (isDragging) {
      isDragging = false;
      if (currentId && onMoveCallback) {
        var entry = Engine.getEntry(currentId);
        if (entry) {
          var d = entry.data;
          var oldX = d.x, oldY = d.y || 0, oldZ = d.z;
          var newX = EditorGrid.snap(translateGroup.position.x);
          var newY = EditorGrid.snap(translateGroup.position.y);
          var newZ = EditorGrid.snap(translateGroup.position.z);
          onMoveCallback(currentId, oldX, oldY, oldZ, newX, newY, newZ);
        }
      }
      activeAxis = null;
      return;
    }

    if (isRotating) {
      isRotating = false;
      if (currentId && onRotateCallback && rotateAxis) {
        var entry = Engine.getEntry(currentId);
        if (entry && entry.meshGroup) {
          var rotKey = rotateAxis;
          var startRot = rotKey === 'x' ? objectStartRotX : rotKey === 'y' ? objectStartRotY : objectStartRotZ;
          var newRot = rotKey === 'x' ? entry.meshGroup.rotation.x : rotKey === 'y' ? entry.meshGroup.rotation.y : entry.meshGroup.rotation.z;
          onRotateCallback(currentId, rotKey, startRot, newRot);
        }
      }
      rotateAxis = null;
      return;
    }

    if (isResizing) {
      isResizing = false;
      // Final rebuild + panel refresh is handled by the callback
      if (currentId && onResizeCallback) {
        onResizeCallback(currentId);
      }
      resizeAxis = null;
      return;
    }
  }

  function onMove(fn) { onMoveCallback = fn; }
  function onRotate(fn) { onRotateCallback = fn; }
  function onResize(fn) { onResizeCallback = fn; }
  function isActive() { return isDragging || isRotating || isResizing; }

  function detach() {
    currentId = null;
    mode = 'move';
    hideAll();
  }

  return {
    init: init,
    attachTo: attachTo,
    detach: detach,
    toggleMode: toggleMode,
    getMode: getMode,
    setMode: setMode,
    onMove: onMove,
    onRotate: onRotate,
    onResize: onResize,
    isActive: isActive
  };
})();
