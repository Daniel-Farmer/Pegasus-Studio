// ============================================================
// EDITOR-COMPASS — 3D orientation gizmo (axis indicator)
// ============================================================

var EditorCompass = (function() {
  'use strict';

  var compassScene, compassCamera;
  var SIZE = 90;   // CSS pixels
  var MARGIN_X = 8;
  var MARGIN_Y = 32; // clear the stats overlay at top

  function init() {
    compassScene = new THREE.Scene();

    // Orthographic camera — will orbit origin to match main camera angle
    compassCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 10);

    // Small origin sphere
    var originGeo = new THREE.SphereGeometry(0.08, 12, 12);
    var originMat = new THREE.MeshBasicMaterial({ color: 0x666666 });
    compassScene.add(new THREE.Mesh(originGeo, originMat));

    // Positive axes + cones + labels
    addAxis(new THREE.Vector3(1, 0, 0), 1.1, 0xe74c3c, 'X');
    addAxis(new THREE.Vector3(0, 1, 0), 1.1, 0x2ecc71, 'Y');
    addAxis(new THREE.Vector3(0, 0, 1), 1.1, 0x3498db, 'Z');

    // Negative axes (short, dimmer, no label)
    addAxis(new THREE.Vector3(-1, 0, 0), 0.5, 0x662222);
    addAxis(new THREE.Vector3(0, -1, 0), 0.5, 0x226622);
    addAxis(new THREE.Vector3(0, 0, -1), 0.5, 0x225588);

    // Cardinal "N" marker along +Z (forward when yaw=0)
    addLabel('N', new THREE.Vector3(0, 0, 1.65), '#fff', 28);
  }

  function addAxis(dir, length, color, label) {
    // Line
    var pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(length)];
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: color, depthTest: false });
    var line = new THREE.Line(geo, mat);
    line.renderOrder = 1;
    compassScene.add(line);

    if (!label) return;

    // Cone tip
    var coneGeo = new THREE.ConeGeometry(0.07, 0.22, 8);
    var coneMat = new THREE.MeshBasicMaterial({ color: color, depthTest: false });
    var cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(dir.clone().multiplyScalar(length));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.renderOrder = 1;
    compassScene.add(cone);

    // Text label
    addLabel(label, dir.clone().multiplyScalar(length + 0.38), colorToCSS(color), 36);
  }

  function addLabel(text, position, cssColor, fontSize) {
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.font = 'bold ' + (fontSize || 36) + 'px Arial';
    ctx.fillStyle = cssColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(0.45, 0.45, 1);
    sprite.renderOrder = 2;
    compassScene.add(sprite);
  }

  function colorToCSS(hex) {
    var r = (hex >> 16) & 255;
    var g = (hex >> 8) & 255;
    var b = hex & 255;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function render(renderer) {
    if (!compassScene || !renderer) return;

    var mainCam = EditorViewport.getCamera();
    if (!mainCam) return;

    // Position compass camera opposite to main camera's look direction
    var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCam.quaternion);
    compassCamera.position.copy(forward.multiplyScalar(-4));
    compassCamera.lookAt(0, 0, 0);

    // Calculate viewport position (top-right of the 3D slot)
    var canvasEl = renderer.domElement;
    var cw = canvasEl.clientWidth;
    var ch = canvasEl.clientHeight;

    var vpX, vpY, vpW, vpH;

    if (typeof EditorQuad !== 'undefined') {
      var slot = EditorQuad.getSlot0();
      if (slot) {
        // slot0 coords: x/y from top-left as fractions, w/h as fractions
        var slotPx = Math.floor(slot.x * cw);
        var slotPy = Math.floor((1 - slot.y - slot.h) * ch); // GL bottom-left origin
        var slotPw = Math.floor(slot.w * cw);
        var slotPh = Math.floor(slot.h * ch);

        vpW = SIZE;
        vpH = SIZE;
        vpX = slotPx + slotPw - SIZE - MARGIN_X;
        vpY = slotPy + slotPh - SIZE - MARGIN_Y; // below stats overlay
      }
    }

    if (vpX === undefined) {
      vpW = SIZE;
      vpH = SIZE;
      vpX = cw - SIZE - MARGIN_X;
      vpY = ch - SIZE - MARGIN_Y;
    }

    // Render compass on top of main scene
    var oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setViewport(vpX, vpY, vpW, vpH);
    renderer.setScissor(vpX, vpY, vpW, vpH);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(compassScene, compassCamera);

    // Restore
    renderer.autoClear = oldAutoClear;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cw, ch);
  }

  return { init: init, render: render };
})();
