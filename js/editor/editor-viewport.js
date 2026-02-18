// ============================================================
// EDITOR-VIEWPORT — Fly camera (WASD + mouselook), raycasting, selection
// ============================================================

var EditorViewport = (function() {
  'use strict';

  var camera, renderer, scene, canvas;

  // Camera state — yaw/pitch + position
  var camYaw = Math.PI * 0.75;   // horizontal angle (radians)
  var camPitch = -0.3;           // vertical angle (radians, negative = looking down)
  var moveSpeed = 20;            // units/sec
  var lookSensitivity = 0.003;
  var sprintMult = 2.5;

  // Key state
  var keys = {};
  var isRightDown = false;
  var isMiddleDown = false;
  var isLeftDown = false;
  var prevMouse = { x: 0, y: 0 };
  var isDragging = false;

  // Raycasting / selection
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var selectedId = null;
  var selectedIds = [];  // multi-selection
  var outlineMeshes = [];
  var onSelectCallback = null;
  var onMultiSelectCallback = null;
  var cursorWorldPos = new THREE.Vector3();

  // Select tool — box select
  var selectToolActive = false;
  var isBoxSelecting = false;
  var boxSelectStart = { x: 0, y: 0 };
  var boxSelectEl = null;

  // Hover highlight
  var hoveredId = null;
  var hoverMeshes = [];
  var lastHoverTime = 0;
  var HOVER_THROTTLE = 50; // ms
  var viewportEnabled = true;

  // Double-click tracking
  var lastClickTime = 0;
  var lastClickId = null;
  var DBLCLICK_THRESHOLD = 300; // ms

  // Timing
  var lastTime = 0;

  function init(scn, cvs) {
    scene = scn;
    canvas = cvs;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x1a1a1a);

    // Camera — start above the scene looking down the street
    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.5, 500);
    camera.position.set(78, 12, 65);
    applyCameraRotation();

    // Mouse events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    // Key events
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    // Track focus loss to reset keys
    window.addEventListener('blur', function() { keys = {}; });

    lastTime = performance.now();

    boxSelectEl = document.getElementById('box-select-rect');

    return { camera: camera, renderer: renderer };
  }

  function applyCameraRotation() {
    // Clamp pitch
    camPitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, camPitch));
    // Build direction from yaw + pitch
    var dir = new THREE.Vector3(
      Math.sin(camYaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYaw) * Math.cos(camPitch)
    );
    var target = new THREE.Vector3().addVectors(camera.position, dir);
    camera.lookAt(target);
  }

  // --- Helper: is top-down mode active? ---
  function isTopDown() {
    return typeof EditorQuad !== 'undefined' && EditorQuad.getViewMode() === 'topdown';
  }

  // --- Movement update (called each frame) ---
  function update() {
    var now = performance.now();
    var dt = Math.min((now - lastTime) / 1000, 0.1); // cap delta
    lastTime = now;

    // WASD only in 3D viewport
    if (typeof EditorQuad !== 'undefined' && EditorQuad.getActiveIndex() !== 0) return;

    var speed = moveSpeed * dt;

    if (isTopDown()) {
      // Top-down mode: WASD pans the orthographic view
      var panX = 0, panZ = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    panZ -= speed;
      if (keys['KeyS'] || keys['ArrowDown'])  panZ += speed;
      if (keys['KeyA'] || keys['ArrowLeft'])  panX -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) panX += speed;

      if (panX !== 0 || panZ !== 0) {
        EditorQuad.panOrthoWorld(panX, panZ);
      }
      return; // skip 3D movement
    }

    // 3D mode: existing fly camera logic
    // Forward/back direction (on XZ plane)
    var forwardX = Math.sin(camYaw);
    var forwardZ = Math.cos(camYaw);
    // Right direction
    var rightX = -Math.cos(camYaw);
    var rightZ = Math.sin(camYaw);

    var moveX = 0, moveY = 0, moveZ = 0;

    // Arrow keys nudge selected objects (handled by editor-main), so only use them for camera when nothing selected
    var arrowsForCamera = !selectedId;
    if (keys['KeyW'] || (arrowsForCamera && keys['ArrowUp']))    { moveX += forwardX * speed; moveZ += forwardZ * speed; }
    if (keys['KeyS'] || (arrowsForCamera && keys['ArrowDown']))  { moveX -= forwardX * speed; moveZ -= forwardZ * speed; }
    if (keys['KeyA'] || (arrowsForCamera && keys['ArrowLeft']))  { moveX -= rightX * speed;   moveZ -= rightZ * speed; }
    if (keys['KeyD'] || (arrowsForCamera && keys['ArrowRight'])) { moveX += rightX * speed;   moveZ += rightZ * speed; }
    if (keys['Space'])                        { moveY += speed; }
    if (keys['ShiftLeft'] || keys['ShiftRight']) { moveY -= speed; }

    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
      camera.position.x += moveX;
      camera.position.y += moveY;
      camera.position.z += moveZ;
      // Keep above ground
      if (camera.position.y < 0.5) camera.position.y = 0.5;
    }
  }

  // --- Mouse handlers ---
  function onMouseDown(e) {
    if (!viewportEnabled) return;
    if (typeof EditorQuad !== 'undefined') EditorQuad.updateActiveFromMouse(e.clientX, e.clientY);

    // Check PiP click first
    if (typeof EditorQuad !== 'undefined' && EditorQuad.isClickInPiP(e.clientX, e.clientY)) {
      EditorQuad.toggleViewMode();
      updateStatusHint();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Draw tool intercept — top-down left click
    if (e.button === 0 && isTopDown() && typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
      updateCursorWorldPos(e);
      EditorDraw.onMouseDown(cursorWorldPos.clone());
      e.preventDefault();
      return;
    }

    // Road tool intercept — left click
    if (e.button === 0 && typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) {
      updateCursorWorldPos(e);
      // Double-click → finalize
      var roadNow = performance.now();
      if ((roadNow - lastClickTime) < DBLCLICK_THRESHOLD && EditorRoad.isDrawing()) {
        EditorRoad.onDoubleClick();
        lastClickTime = 0;
        e.preventDefault();
        return;
      }
      lastClickTime = roadNow;
      EditorRoad.onClick(cursorWorldPos.clone());
      e.preventDefault();
      return;
    }

    // Sculpt tool intercept — works in any view
    if (e.button === 0 && typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
      var sculptPos = getSculptWorldPos(e);
      if (sculptPos) {
        EditorSculpt.onMouseDown(sculptPos);
        e.preventDefault();
        return;
      }
    }

    // Select tool — box select start (top-down, left click, not on gizmo)
    if (e.button === 0 && selectToolActive && isTopDown() && !(typeof EditorGizmo !== 'undefined' && EditorGizmo.isActive())) {
      boxSelectStart.x = e.clientX;
      boxSelectStart.y = e.clientY;
      isBoxSelecting = true;
      if (boxSelectEl) {
        boxSelectEl.style.display = 'block';
        boxSelectEl.style.left = e.clientX + 'px';
        boxSelectEl.style.top = e.clientY + 'px';
        boxSelectEl.style.width = '0';
        boxSelectEl.style.height = '0';
      }
      e.preventDefault();
      return;
    }

    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
    isDragging = false;

    if (e.button === 2) {
      // Right mouse — look mode (3D) / pan (top-down)
      isRightDown = true;
      if (!isTopDown()) {
        canvas.requestPointerLock();
      }
    }
    if (e.button === 1) {
      // Middle mouse — pan
      isMiddleDown = true;
      e.preventDefault();
    }
    if (e.button === 0 && isTopDown()) {
      // Left mouse in top-down — pan (when not on gizmo)
      isLeftDown = true;
    }
  }

  function onMouseMove(e) {
    if (!viewportEnabled) return;

    // Draw tool intercept — update preview during drag
    if (isTopDown() && typeof EditorDraw !== 'undefined' && EditorDraw.isCurrentlyDrawing()) {
      updateCursorWorldPos(e);
      EditorDraw.onMouseMove(cursorWorldPos.clone());
      return;
    }

    // Road tool intercept — update preview
    if (typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) {
      updateCursorWorldPos(e);
      EditorRoad.onMouseMove(cursorWorldPos.clone());
    }

    // Sculpt tool intercept — painting or preview (any view)
    if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isPainting()) {
      var sculptPos = getSculptWorldPos(e);
      if (sculptPos) EditorSculpt.onMouseMove(sculptPos);
      return;
    }
    if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
      var sculptPos2 = getSculptWorldPos(e);
      if (sculptPos2) EditorSculpt.updatePreview(sculptPos2);
    }

    // Box select rubber band
    if (isBoxSelecting && boxSelectEl) {
      var bx = Math.min(boxSelectStart.x, e.clientX);
      var by = Math.min(boxSelectStart.y, e.clientY);
      var bw = Math.abs(e.clientX - boxSelectStart.x);
      var bh = Math.abs(e.clientY - boxSelectStart.y);
      boxSelectEl.style.left = bx + 'px';
      boxSelectEl.style.top = by + 'px';
      boxSelectEl.style.width = bw + 'px';
      boxSelectEl.style.height = bh + 'px';
      return;
    }

    var dx, dy;

    // Use movementX/Y when pointer is locked for smooth mouselook
    if (document.pointerLockElement === canvas) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else {
      dx = e.clientX - prevMouse.x;
      dy = e.clientY - prevMouse.y;
    }

    var topDown = isTopDown();

    if (isRightDown) {
      if (topDown) {
        // Right-drag pans in top-down
        EditorQuad.handleOrthoPan(dx, dy);
        isDragging = true;
      } else {
        // Mouselook — 3D viewport
        camYaw -= dx * lookSensitivity;
        camPitch -= dy * lookSensitivity;
        applyCameraRotation();
        isDragging = true;
      }
    }

    if (isMiddleDown) {
      if (topDown) {
        // Middle-drag pans in top-down
        EditorQuad.handleOrthoPan(dx, dy);
      } else {
        // Pan (move camera on its local right/up axes) — 3D
        var panSpeed = 0.05;
        var rightX = Math.cos(camYaw);
        var rightZ = -Math.sin(camYaw);
        camera.position.x -= dx * panSpeed * rightX;
        camera.position.z -= dx * panSpeed * rightZ;
        camera.position.y += dy * panSpeed;
        if (camera.position.y < 0.5) camera.position.y = 0.5;
      }
      isDragging = true;
    }

    if (isLeftDown && topDown) {
      // Left-drag pans in top-down (when gizmo not active)
      if (!(typeof EditorGizmo !== 'undefined' && EditorGizmo.isActive())) {
        EditorQuad.handleOrthoPan(dx, dy);
        isDragging = true;
      }
    }

    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;

    // Update cursor world position for status bar
    updateCursorWorldPos(e);

    // Hover highlight — throttled, skip during drag/look/gizmo
    if (!isRightDown && !isMiddleDown && !isDragging && !(typeof EditorGizmo !== 'undefined' && EditorGizmo.isActive())) {
      var now = performance.now();
      if (now - lastHoverTime > HOVER_THROTTLE) {
        lastHoverTime = now;
        doHoverRaycast(e);
      }
    }
  }

  function onMouseUp(e) {
    if (!viewportEnabled) return;

    // Sculpt tool intercept — stop painting
    if (e.button === 0 && typeof EditorSculpt !== 'undefined' && EditorSculpt.isPainting()) {
      EditorSculpt.onMouseUp();
      return;
    }

    // Draw tool intercept — commit shape
    if (e.button === 0 && typeof EditorDraw !== 'undefined' && EditorDraw.isCurrentlyDrawing()) {
      updateCursorWorldPos(e);
      EditorDraw.onMouseUp(cursorWorldPos.clone());
      return;
    }

    // Box select — finalize
    if (e.button === 0 && isBoxSelecting) {
      isBoxSelecting = false;
      if (boxSelectEl) boxSelectEl.style.display = 'none';
      var bx1 = Math.min(boxSelectStart.x, e.clientX);
      var by1 = Math.min(boxSelectStart.y, e.clientY);
      var bx2 = Math.max(boxSelectStart.x, e.clientX);
      var by2 = Math.max(boxSelectStart.y, e.clientY);
      var bw = bx2 - bx1;
      var bh = by2 - by1;
      if (bw < 5 && bh < 5) {
        // Tiny drag — treat as click: raycast single select (with Ctrl support)
        var hitId = doRaycastRaw(e);
        if ((e.ctrlKey || e.metaKey) && hitId) {
          toggleInSelection(hitId);
        } else {
          selectObject(hitId);
        }
      } else {
        // Real box drag — find all objects whose screen position falls inside
        var ids = getIdsInScreenRect(bx1, by1, bx2, by2);
        if (e.ctrlKey || e.metaKey) {
          // Add to existing selection
          for (var si = 0; si < ids.length; si++) {
            if (selectedIds.indexOf(ids[si]) === -1) addToSelection(ids[si]);
          }
        } else {
          selectMultiple(ids);
        }
      }
      return;
    }

    if (e.button === 2) {
      isRightDown = false;
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    }
    if (e.button === 1) {
      isMiddleDown = false;
    }
    if (e.button === 0) {
      isLeftDown = false;
      if (!isDragging && !(typeof EditorGizmo !== 'undefined' && EditorGizmo.isActive())) {
        // Ctrl+click multi-select (when select tool active)
        if (selectToolActive && (e.ctrlKey || e.metaKey)) {
          var shiftHitId = doRaycastRaw(e);
          if (shiftHitId) {
            toggleInSelection(shiftHitId);
            return;
          }
        }

        // Left click — select (skip if gizmo is being dragged)
        var hitId = doRaycast(e);

        // Double-click detection
        var now = performance.now();
        if ((now - lastClickTime) < DBLCLICK_THRESHOLD) {
          if (hitId && hitId === lastClickId) {
            // Double-click on object — focus
            var entry = Engine.getEntry(hitId);
            if (entry && entry.data) {
              var d = entry.data;
              focusOn(new THREE.Vector3(
                (d.x || 0) + (d.w || 0) / 2,
                (d.h || 0) / 2,
                (d.z || 0) + (d.d || 0) / 2
              ));
            }
          } else if (!hitId && !lastClickId) {
            // Double-click on empty space — toggle maximize
            if (typeof EditorQuad !== 'undefined') {
              var qi = EditorQuad.getActiveIndex();
              if (EditorQuad.isMaximized()) {
                EditorQuad.restore();
              } else {
                EditorQuad.maximize(qi);
              }
            }
          }
          lastClickId = null;
          lastClickTime = 0;
        } else {
          lastClickId = hitId;
          lastClickTime = now;
        }
      }
    }
    isDragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    if (!viewportEnabled) return;
    if (typeof EditorQuad !== 'undefined') EditorQuad.updateActiveFromMouse(e.clientX, e.clientY);

    if (isTopDown()) {
      // Top-down: zoom ortho frustum
      EditorQuad.handleOrthoScroll(e.deltaY);
    } else {
      // 3D viewport — existing dolly/speed logic
      if (e.shiftKey) {
        moveSpeed *= (1 - e.deltaY * 0.001);
        moveSpeed = Math.max(2, Math.min(200, moveSpeed));
      } else {
        var dolly = -e.deltaY * 0.05;
        var forwardX = Math.sin(camYaw) * Math.cos(camPitch);
        var forwardY = Math.sin(camPitch);
        var forwardZ = Math.cos(camYaw) * Math.cos(camPitch);
        camera.position.x += forwardX * dolly;
        camera.position.y += forwardY * dolly;
        camera.position.z += forwardZ * dolly;
        if (camera.position.y < 0.5) camera.position.y = 0.5;
      }
    }
  }

  // --- Key handlers (only for movement keys, let editor-main handle shortcuts) ---
  function onKeyDown(e) {
    if (!viewportEnabled) return;
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    keys[e.code] = true;
  }

  function onKeyUp(e) {
    if (!viewportEnabled) { keys = {}; return; }
    keys[e.code] = false;
  }

  function setEnabled(v) {
    viewportEnabled = v;
    if (!v) { keys = {}; isRightDown = false; isMiddleDown = false; isLeftDown = false; isDragging = false; }
  }

  function onResize() {
    var w = canvas.parentElement.clientWidth;
    var h = canvas.parentElement.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (typeof EditorQuad !== 'undefined') EditorQuad.onResize(w, h);
    if (typeof EditorPlaytest !== 'undefined') EditorPlaytest.onResize();
  }

  // --- Cursor / Raycast ---
  function updateCursorWorldPos(e) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, activeCam);
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    raycaster.ray.intersectPlane(plane, cursorWorldPos);
  }

  // Raycast against terrain meshes for sculpt, fall back to Y=0 plane
  function getSculptWorldPos(e) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, activeCam);

    // Try to hit terrain meshes first
    var terrainMeshes = [];
    var entries = Engine.getAllEntries();
    for (var id in entries) {
      var entry = entries[id];
      if (entry && entry.data && entry.data.primitive === 'terrain' && entry.meshGroup) {
        entry.meshGroup.traverse(function(child) {
          if (child.isMesh && !child.userData.isHelper) terrainMeshes.push(child);
        });
      }
    }
    if (terrainMeshes.length > 0) {
      var hits = raycaster.intersectObjects(terrainMeshes, false);
      if (hits.length > 0) return hits[0].point.clone();
    }

    // Fall back to Y=0 plane
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var target = new THREE.Vector3();
    var hit = raycaster.ray.intersectPlane(plane, target);
    return hit ? target : null;
  }

  function doRaycast(e) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, activeCam);

    var hitId = raycastHitId();
    selectObject(hitId);
    return hitId;
  }

  function raycastHitId() {
    var intersects = raycaster.intersectObjects(scene.children, true);
    for (var i = 0; i < intersects.length; i++) {
      var obj = intersects[i].object;
      while (obj) {
        if (obj.userData && obj.userData.sceneId) {
          // Skip hidden objects
          var entry = Engine.getEntry(obj.userData.sceneId);
          if (entry && entry.data && entry.data.hidden) break;
          return obj.userData.sceneId;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  function doHoverRaycast(e) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, activeCam);

    var hitId = raycastHitId();

    // Don't hover the selected object or same hover
    if (hitId === selectedId || hitId === hoveredId) {
      if (hitId === selectedId && hoveredId) {
        clearHoverOutline();
      }
      return;
    }

    clearHoverOutline();

    if (hitId) {
      hoveredId = hitId;
      var entry = Engine.getEntry(hitId);
      if (entry && entry.meshGroup) {
        addHoverOutline(entry.meshGroup);
      }
    } else {
      hoveredId = null;
    }
  }

  function addHoverOutline(group) {
    group.updateMatrixWorld(true);
    var groupInv = new THREE.Matrix4().copy(group.matrixWorld).invert();

    var meshes = [];
    group.traverse(function(child) {
      if (child.isMesh && child.geometry && !child.userData.isHelper) {
        meshes.push(child);
      }
    });

    for (var i = 0; i < meshes.length; i++) {
      var child = meshes[i];
      var edges = new THREE.EdgesGeometry(child.geometry, 15);
      var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffaa44, linewidth: 2, depthTest: false }));
      line.renderOrder = 998;

      var relMat = new THREE.Matrix4().copy(child.matrixWorld).premultiply(groupInv);
      relMat.decompose(line.position, line.quaternion, line.scale);

      group.add(line);
      hoverMeshes.push(line);
    }
  }

  function clearHoverOutline() {
    for (var i = 0; i < hoverMeshes.length; i++) {
      if (hoverMeshes[i].parent) hoverMeshes[i].parent.remove(hoverMeshes[i]);
      hoverMeshes[i].geometry.dispose();
      hoverMeshes[i].material.dispose();
    }
    hoverMeshes = [];
    hoveredId = null;
  }

  function selectObject(id) {
    clearOutlines();
    clearHoverOutline();
    selectedId = id;
    selectedIds = id ? [id] : [];

    if (id) {
      var entry = Engine.getEntry(id);
      if (entry && entry.meshGroup) {
        addOutline(entry.meshGroup);
      }
    }

    if (onSelectCallback) onSelectCallback(id);
    if (onMultiSelectCallback) onMultiSelectCallback(selectedIds.slice());
  }

  // --- Multi-selection ---

  function addToSelection(id) {
    if (!id) return;
    if (selectedIds.indexOf(id) !== -1) return;
    selectedIds.push(id);
    // Primary = first selected
    if (!selectedId) selectedId = id;
    var entry = Engine.getEntry(id);
    if (entry && entry.meshGroup) addOutline(entry.meshGroup);
    if (onSelectCallback) onSelectCallback(selectedId);
    if (onMultiSelectCallback) onMultiSelectCallback(selectedIds.slice());
  }

  function removeFromSelection(id) {
    var idx = selectedIds.indexOf(id);
    if (idx === -1) return;
    selectedIds.splice(idx, 1);
    // Update primary
    if (selectedId === id) {
      selectedId = selectedIds.length > 0 ? selectedIds[0] : null;
    }
    // Rebuild all outlines
    clearOutlines();
    for (var i = 0; i < selectedIds.length; i++) {
      var entry = Engine.getEntry(selectedIds[i]);
      if (entry && entry.meshGroup) addOutline(entry.meshGroup);
    }
    if (onSelectCallback) onSelectCallback(selectedId);
    if (onMultiSelectCallback) onMultiSelectCallback(selectedIds.slice());
  }

  function toggleInSelection(id) {
    if (!id) return;
    if (selectedIds.indexOf(id) !== -1) {
      removeFromSelection(id);
    } else {
      addToSelection(id);
    }
  }

  function selectMultiple(ids) {
    clearOutlines();
    clearHoverOutline();
    selectedIds = ids.slice();
    selectedId = ids.length > 0 ? ids[0] : null;
    for (var i = 0; i < ids.length; i++) {
      var entry = Engine.getEntry(ids[i]);
      if (entry && entry.meshGroup) addOutline(entry.meshGroup);
    }
    if (onSelectCallback) onSelectCallback(selectedId);
    if (onMultiSelectCallback) onMultiSelectCallback(selectedIds.slice());
  }

  function getSelectedIds() { return selectedIds.slice(); }

  function setSelectToolActive(active) { selectToolActive = !!active; }

  // --- Box-select helpers ---

  function doRaycastRaw(e) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(e.clientX, e.clientY);
      mouse.x = ndc.x;
      mouse.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, activeCam);
    return raycastHitId();
  }

  function getIdsInScreenRect(sx1, sy1, sx2, sy2) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    var rect = canvas.getBoundingClientRect();
    var ids = [];
    var entries = Engine.getAllEntries();
    for (var eid in entries) {
      var entry = entries[eid];
      if (!entry || !entry.data) continue;
      if (entry.data.hidden) continue;
      var d = entry.data;
      var pos = new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0);
      pos.project(activeCam);
      // Convert NDC to screen coords
      var sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
      var sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
      if (sx >= sx1 && sx <= sx2 && sy >= sy1 && sy <= sy2) {
        ids.push(eid);
      }
    }
    return ids;
  }

  function addOutline(group) {
    // Ensure world matrices are current
    group.updateMatrixWorld(true);
    var groupInv = new THREE.Matrix4().copy(group.matrixWorld).invert();

    // Collect meshes first to avoid modifying tree during traversal
    var meshes = [];
    group.traverse(function(child) {
      if (child.isMesh && child.geometry && !child.userData.isHelper) {
        meshes.push(child);
      }
    });

    for (var i = 0; i < meshes.length; i++) {
      var child = meshes[i];
      var edges = new THREE.EdgesGeometry(child.geometry, 15);
      var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x44aaff, linewidth: 2, depthTest: false }));
      line.renderOrder = 999;

      // Compute child's full transform relative to the group
      var relMat = new THREE.Matrix4().copy(child.matrixWorld).premultiply(groupInv);
      relMat.decompose(line.position, line.quaternion, line.scale);

      group.add(line);
      outlineMeshes.push(line);
    }
  }

  function clearOutlines() {
    for (var i = 0; i < outlineMeshes.length; i++) {
      if (outlineMeshes[i].parent) outlineMeshes[i].parent.remove(outlineMeshes[i]);
      outlineMeshes[i].geometry.dispose();
      outlineMeshes[i].material.dispose();
    }
    outlineMeshes = [];
  }

  function render() {
    if (renderer && scene && camera) {
      update(); // process WASD movement each frame
      EditorQuad.render(renderer, scene);
    }
  }

  function getSelectedId() { return selectedId; }
  function getCamera() { return camera; }
  function getRenderer() { return renderer; }
  function getCursorWorldPos() { return cursorWorldPos; }

  function onSelect(fn) { onSelectCallback = fn; }

  function focusOn(position) {
    camera.position.set(position.x, position.y + 10, position.z + 15);
    // Look toward the target
    var dx = position.x - camera.position.x;
    var dz = position.z - camera.position.z;
    var dy = position.y - camera.position.y;
    camYaw = Math.atan2(dx, dz);
    camPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    applyCameraRotation();
  }

  function updateStatusHint() {
    var el = document.getElementById('status-controls');
    if (!el) return;
    if (isTopDown()) {
      var hint = 'WASD pan | Right-drag pan | Scroll zoom | Click select | T toggle 3D';
      if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
        var stool = EditorSculpt.getTool();
        var stoolNames = { raise: 'Raise', lower: 'Lower', smooth: 'Smooth', flatten: 'Flatten' };
        hint = 'Sculpting: ' + (stoolNames[stool] || stool) + ' | Drag to paint | [ ] brush size | Esc cancel | 5-8 switch tool';
      } else if (typeof EditorDraw !== 'undefined' && EditorDraw.isActive()) {
        var tool = EditorDraw.getTool();
        var toolNames = { wall: 'Wall', room: 'Room', floor: 'Floor', door: 'Door' };
        hint = 'Drawing: ' + (toolNames[tool] || tool) + ' | Drag to draw | Esc cancel | 1-4 switch tool';
      } else if (typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) {
        hint = 'Road: Click waypoints | Double-click/Enter finalize | Backspace undo point | Esc cancel';
      } else if (selectToolActive) {
        hint = 'Select: Click pick | Ctrl+click toggle | Drag box-select | Ctrl+drag add to selection';
      }
      el.textContent = hint;
    } else {
      var hint3d = 'WASD move | Right-drag look | Space up | Shift down | Scroll zoom | Click select | Dbl-click focus | Tab cycle | R resize | Ctrl+D dup | T toggle top-down | Esc deselect';
      if (typeof EditorSculpt !== 'undefined' && EditorSculpt.isActive()) {
        var stool3d = EditorSculpt.getTool();
        var stoolNames3d = { raise: 'Raise', lower: 'Lower', smooth: 'Smooth', flatten: 'Flatten' };
        hint3d = 'Sculpting: ' + (stoolNames3d[stool3d] || stool3d) + ' | Click terrain to paint | [ ] brush size | Esc cancel | 5-8 switch tool';
      } else if (typeof EditorRoad !== 'undefined' && EditorRoad.isActive()) {
        hint3d = 'Road: Click waypoints | Double-click/Enter finalize | Backspace undo point | Esc cancel';
      } else if (selectToolActive) {
        hint3d = 'Select: Click pick | Ctrl+click toggle | ' + hint3d;
      }
      el.textContent = hint3d;
    }
  }

  function screenToWorld(clientX, clientY) {
    var activeCam = (typeof EditorQuad !== 'undefined') ? EditorQuad.getActiveCamera() : camera;
    var m = new THREE.Vector2();
    if (typeof EditorQuad !== 'undefined') {
      var ndc = EditorQuad.getNDC(clientX, clientY);
      m.x = ndc.x;
      m.y = ndc.y;
    } else {
      var rect = canvas.getBoundingClientRect();
      m.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      m.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    var rc = new THREE.Raycaster();
    rc.setFromCamera(m, activeCam);
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var target = new THREE.Vector3();
    rc.ray.intersectPlane(plane, target);
    return target;
  }

  return {
    init: init,
    render: render,
    getSelectedId: getSelectedId,
    getSelectedIds: getSelectedIds,
    getCamera: getCamera,
    getRenderer: getRenderer,
    getCursorWorldPos: getCursorWorldPos,
    selectObject: selectObject,
    selectMultiple: selectMultiple,
    addToSelection: addToSelection,
    removeFromSelection: removeFromSelection,
    onSelect: onSelect,
    onMultiSelect: function(fn) { onMultiSelectCallback = fn; },
    setSelectToolActive: setSelectToolActive,
    focusOn: focusOn,
    onResize: onResize,
    setEnabled: setEnabled,
    getCamYaw: function() { return camYaw; },
    updateStatusHint: updateStatusHint,
    screenToWorld: screenToWorld
  };
})();
