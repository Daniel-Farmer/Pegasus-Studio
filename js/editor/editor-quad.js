// ============================================================
// EDITOR-QUAD — Layout manager for 3D viewport
// Single renderer, full canvas. Supports 3D perspective and
// top-down orthographic view modes with PiP preview.
// ============================================================

var EditorQuad = (function() {
  'use strict';

  var renderer, perspCamera, canvasEl;
  var orthoCamera;

  var activeIndex = 0;
  var maximizedIndex = -1;

  // View mode: '3d' or 'topdown'
  var viewMode = '3d';
  var orthoZoom = 50;
  var orthoCenterX = 50;
  var orthoCenterZ = 50;
  var orthoHeight = 120;

  // PiP (picture-in-picture) preview
  var pipFrameCounter = 0;
  var PIP_W = 200;
  var PIP_H = 150;
  var PIP_MARGIN = 10;

  // DOM refs
  var label0;

  // Slot 0 rect — always full canvas
  var slot0 = { x: 0, y: 0, w: 1, h: 1 };

  function init(rend, persCamera, cvs) {
    renderer = rend;
    perspCamera = persCamera;
    canvasEl = cvs;

    label0 = document.getElementById('ql-0');

    // Hide the cross divider — no longer needed
    var crossV = document.getElementById('quad-cross-v');
    if (crossV) crossV.style.display = 'none';

    // Enable layer 1 on perspective camera so it sees helper meshes
    perspCamera.layers.enable(1);

    // Create orthographic camera for top-down view (layer 0 only — hides helpers)
    orthoCamera = new THREE.OrthographicCamera(
      -orthoZoom, orthoZoom, orthoZoom, -orthoZoom, 0.1, 500
    );
    updateOrthoCamera();

    updateLabel();
  }

  function updateOrthoCamera() {
    if (!orthoCamera || !canvasEl) return;
    var wrap = canvasEl.parentElement;
    var cw = wrap.clientWidth;
    var ch = wrap.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    var aspect = cw / ch;
    orthoCamera.left = -orthoZoom * aspect;
    orthoCamera.right = orthoZoom * aspect;
    orthoCamera.top = orthoZoom;
    orthoCamera.bottom = -orthoZoom;
    orthoCamera.updateProjectionMatrix();

    orthoCamera.position.set(orthoCenterX, orthoHeight, orthoCenterZ);
    orthoCamera.lookAt(orthoCenterX, 0, orthoCenterZ);
  }

  function updateLabel() {
    if (!canvasEl || !label0) return;
    label0.style.left = '4px';
    label0.style.top = '2px';
    label0.style.display = 'block';
    label0.classList.add('active');
    label0.textContent = viewMode === 'topdown' ? 'Top-Down' : '3D';
  }

  // --- Render: single pass, full canvas ---
  function render(rend, scene) {
    var wrap = canvasEl.parentElement;
    var cw = wrap.clientWidth;
    var ch = wrap.clientHeight;

    var activeCam;
    if (viewMode === 'topdown') {
      activeCam = orthoCamera;
      if (cw > 0 && ch > 0) {
        updateOrthoCamera();
      }
    } else {
      activeCam = perspCamera;
      if (cw > 0 && ch > 0) {
        perspCamera.aspect = cw / ch;
        perspCamera.updateProjectionMatrix();
      }
    }

    rend.setScissorTest(false);
    rend.setViewport(0, 0, cw, ch);
    rend.render(scene, activeCam);
  }

  // --- Active viewport ---
  function getActiveCamera() {
    return viewMode === 'topdown' ? orthoCamera : perspCamera;
  }
  function getActiveIndex() { return 0; }
  function updateActiveFromMouse() { activeIndex = 0; }

  // --- NDC relative to full canvas ---
  function getNDC(clientX, clientY) {
    var wrap = canvasEl.parentElement;
    var wrapRect = wrap.getBoundingClientRect();

    return {
      x: ((clientX - wrapRect.left) / wrapRect.width) * 2 - 1,
      y: -((clientY - wrapRect.top) / wrapRect.height) * 2 + 1
    };
  }

  // --- Resize handler ---
  function onResize() {
    updateLabel();
    updateOrthoCamera();
  }

  // --- View mode toggle ---
  function toggleViewMode() {
    if (viewMode === '3d') {
      viewMode = 'topdown';
      // Sync ortho center to perspective camera's XZ position
      orthoCenterX = perspCamera.position.x;
      orthoCenterZ = perspCamera.position.z;
      updateOrthoCamera();
    } else {
      viewMode = '3d';
    }
    updateLabel();
    updatePipLabel();
    return viewMode;
  }

  function getViewMode() { return viewMode; }

  // --- Ortho pan (pixel deltas from mouse drag) ---
  function handleOrthoPan(dx, dy) {
    if (!canvasEl) return;
    var wrap = canvasEl.parentElement;
    var ch = wrap.clientHeight;
    if (ch <= 0) return;
    var pixelScale = (orthoZoom * 2) / ch;
    orthoCenterX -= dx * pixelScale;
    orthoCenterZ -= dy * pixelScale;
    updateOrthoCamera();
  }

  // --- Ortho pan (world units, for WASD) ---
  function panOrthoWorld(worldDx, worldDz) {
    orthoCenterX += worldDx;
    orthoCenterZ += worldDz;
    updateOrthoCamera();
  }

  // --- Ortho scroll zoom ---
  function handleOrthoScroll(deltaY) {
    orthoZoom *= (1 + deltaY * 0.001);
    orthoZoom = Math.max(5, Math.min(200, orthoZoom));
    updateOrthoCamera();
  }

  // --- PiP rendering ---
  function renderPiP(rend, scene) {
    if (!orthoCamera || !perspCamera) return;

    var canvasW = canvasEl.parentElement.clientWidth;
    var canvasH = canvasEl.parentElement.clientHeight;
    if (canvasW <= 0 || canvasH <= 0) return;

    // PiP camera is the inactive one
    var pipCam;
    if (viewMode === 'topdown') {
      pipCam = perspCamera;
    } else {
      pipCam = orthoCamera;
    }

    // PiP position: bottom-right (GL coords: origin at bottom-left)
    var vpX = canvasW - PIP_W - PIP_MARGIN;
    var vpY = PIP_MARGIN; // GL bottom-left origin = bottom of screen

    // Save state
    var oldAutoClear = rend.autoClear;
    rend.autoClear = false;

    // Set viewport and scissor for PiP region
    rend.setViewport(vpX, vpY, PIP_W, PIP_H);
    rend.setScissor(vpX, vpY, PIP_W, PIP_H);
    rend.setScissorTest(true);

    // Clear PiP region with dark background
    rend.setClearColor(0x111111);
    rend.clear(true, true, false);
    rend.setClearColor(0x1a1a1a); // restore

    // Adjust PiP camera aspect temporarily
    var pipAspect = PIP_W / PIP_H;
    if (pipCam === perspCamera) {
      var oldAspect = perspCamera.aspect;
      perspCamera.aspect = pipAspect;
      perspCamera.updateProjectionMatrix();
      rend.render(scene, perspCamera);
      perspCamera.aspect = oldAspect;
      perspCamera.updateProjectionMatrix();
    } else {
      // Ortho camera
      var oldLeft = orthoCamera.left;
      var oldRight = orthoCamera.right;
      var oldTop = orthoCamera.top;
      var oldBottom = orthoCamera.bottom;
      orthoCamera.left = -orthoZoom * pipAspect;
      orthoCamera.right = orthoZoom * pipAspect;
      orthoCamera.top = orthoZoom;
      orthoCamera.bottom = -orthoZoom;
      orthoCamera.updateProjectionMatrix();
      rend.render(scene, orthoCamera);
      orthoCamera.left = oldLeft;
      orthoCamera.right = oldRight;
      orthoCamera.top = oldTop;
      orthoCamera.bottom = oldBottom;
      orthoCamera.updateProjectionMatrix();
    }

    // Restore
    rend.autoClear = oldAutoClear;
    rend.setScissorTest(false);
    rend.setViewport(0, 0, canvasW, canvasH);
  }

  // --- PiP click detection ---
  function isClickInPiP(clientX, clientY) {
    if (!canvasEl) return false;
    var wrap = canvasEl.parentElement;
    var rect = wrap.getBoundingClientRect();
    var canvasW = rect.width;
    var canvasH = rect.height;

    // Convert to canvas-local coords
    var localX = clientX - rect.left;
    var localY = clientY - rect.top;

    // PiP is at bottom-right in CSS coords
    var pipLeft = canvasW - PIP_W - PIP_MARGIN;
    var pipTop = canvasH - PIP_H - PIP_MARGIN;

    return localX >= pipLeft && localX <= pipLeft + PIP_W &&
           localY >= pipTop && localY <= pipTop + PIP_H;
  }

  // --- Update PiP label overlay ---
  function updatePipLabel() {
    var el = document.getElementById('pip-label');
    if (el) {
      el.textContent = viewMode === 'topdown' ? '3D' : 'Top-Down';
    }
  }

  // --- Maximize / Restore (no-op now, already full) ---
  function maximize() {}
  function restore() {}
  function isMaximized() { return false; }

  return {
    init: init,
    render: render,
    getActiveCamera: getActiveCamera,
    getActiveIndex: getActiveIndex,
    updateActiveFromMouse: updateActiveFromMouse,
    getNDC: getNDC,
    onResize: onResize,
    maximize: maximize,
    restore: restore,
    isMaximized: isMaximized,
    getSlot0: function() { return slot0; },
    // New exports for top-down + PiP
    toggleViewMode: toggleViewMode,
    getViewMode: getViewMode,
    handleOrthoPan: handleOrthoPan,
    panOrthoWorld: panOrthoWorld,
    handleOrthoScroll: handleOrthoScroll,
    renderPiP: renderPiP,
    isClickInPiP: isClickInPiP
  };
})();
