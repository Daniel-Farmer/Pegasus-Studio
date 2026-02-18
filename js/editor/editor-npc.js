// ============================================================
// EDITOR-NPC — NPC path visualization + endpoint editing
// ============================================================

var EditorNPC = (function() {
  'use strict';

  var scene = null;
  var pathVisuals = []; // { id, group }

  function init(scn) {
    scene = scn;
  }

  function buildVisuals(npcPaths) {
    clearVisuals();
    if (!npcPaths) return;

    for (var i = 0; i < npcPaths.length; i++) {
      var np = npcPaths[i];
      var group = new THREE.Group();
      group.userData.sceneId = np.id;
      group.userData.sceneType = 'npcPath';

      var minX = np.minX || 56;
      var maxX = np.maxX || 104;
      var walkZ = np.walkZ || 49;
      var browseZ = np.browseZ || 48.5;
      var pathLen = maxX - minX;
      var midX = (minX + maxX) / 2;

      // Walk path line (solid)
      var walkColor = np.side === 'north' ? 0x44aaff : 0xff8844;
      var walkGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(minX, 0.3, walkZ),
        new THREE.Vector3(maxX, 0.3, walkZ)
      ]);
      var walkLine = new THREE.Line(walkGeo, new THREE.LineBasicMaterial({ color: walkColor, linewidth: 2 }));
      group.add(walkLine);

      // Browse path line (dashed)
      var browseGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(minX, 0.3, browseZ),
        new THREE.Vector3(maxX, 0.3, browseZ)
      ]);
      var browseLine = new THREE.Line(browseGeo, new THREE.LineDashedMaterial({ color: walkColor, linewidth: 1, dashSize: 0.5, gapSize: 0.3 }));
      browseLine.computeLineDistances();
      group.add(browseLine);

      // Endpoint spheres
      var endGeo = new THREE.SphereGeometry(0.3, 8, 6);
      var endMat = new THREE.MeshBasicMaterial({ color: walkColor, depthTest: false });
      var startSphere = new THREE.Mesh(endGeo, endMat);
      startSphere.position.set(minX, 0.3, walkZ);
      startSphere.renderOrder = 999;
      group.add(startSphere);

      var endSphere = new THREE.Mesh(endGeo.clone(), endMat);
      endSphere.position.set(maxX, 0.3, walkZ);
      endSphere.renderOrder = 999;
      group.add(endSphere);

      // Direction arrow
      var arrowDir = np.dir > 0 ? 1 : -1;
      var arrowGeo = new THREE.ConeGeometry(0.15, 0.4, 6);
      arrowGeo.rotateZ(arrowDir > 0 ? -Math.PI/2 : Math.PI/2);
      var arrowMesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: walkColor, depthTest: false }));
      arrowMesh.position.set(midX, 0.5, walkZ);
      arrowMesh.renderOrder = 999;
      group.add(arrowMesh);

      // Label
      var labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256; labelCanvas.height = 32;
      var ctx = labelCanvas.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, 256, 32);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(np.side + ' path (z=' + walkZ + ')', 128, 16);
      var labelTex = new THREE.CanvasTexture(labelCanvas);
      var labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 0.5),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false, side: THREE.DoubleSide })
      );
      labelMesh.position.set(midX, 1.2, walkZ);
      labelMesh.renderOrder = 999;
      group.add(labelMesh);

      scene.add(group);
      pathVisuals.push({ id: np.id, group: group });
    }
  }

  function clearVisuals() {
    for (var i = 0; i < pathVisuals.length; i++) {
      var pv = pathVisuals[i];
      if (pv.group.parent) pv.group.parent.remove(pv.group);
      pv.group.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    pathVisuals = [];
  }

  function setVisible(visible) {
    for (var i = 0; i < pathVisuals.length; i++) {
      pathVisuals[i].group.visible = visible;
    }
  }

  return {
    init: init,
    buildVisuals: buildVisuals,
    clearVisuals: clearVisuals,
    setVisible: setVisible
  };
})();
