// ============================================================
// BUILDER-SINGLE — 5 primitive builders + behavior applicators
// Returns THREE.Group per object with userData.sceneId/primitive
// ============================================================

var BuilderSingle = (function() {
  'use strict';

  // --- Tag group for editor selection ---
  function tagGroup(group, id, primitive) {
    group.userData.sceneId = id;
    group.userData.sceneType = primitive;
    group.traverse(function(child) {
      child.userData.sceneId = id;
      child.userData.sceneType = primitive;
      // Put helper meshes on layer 1 only (hidden from ortho/top-down camera)
      if (child.userData.isHelper) {
        child.layers.set(1);
      }
    });
    return group;
  }

  // --- glTF cache + loader ---
  var gltfCache = {};
  var gltfLoader = null;
  function getGLTFLoader() {
    if (!gltfLoader && typeof THREE.GLTFLoader !== 'undefined') {
      gltfLoader = new THREE.GLTFLoader();
    }
    return gltfLoader;
  }

  // -------------------------------------------------------
  // BOX — BoxGeometry with 6-material array
  // Pivot at (x, y, z) = center of box
  // -------------------------------------------------------
  function buildBox(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'box');
    var geo = new THREE.BoxGeometry(data.w || 1, data.h || 1, data.d || 1);
    var mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'box');
  }

  // -------------------------------------------------------
  // CYLINDER — CylinderGeometry with 3-material array
  // Pivot at (x, y, z) = center of base
  // -------------------------------------------------------
  function buildCylinder(data) {
    var group = new THREE.Group();
    var h = data.height || 1;
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'cylinder');
    var geo = new THREE.CylinderGeometry(
      data.radiusTop !== undefined ? data.radiusTop : 0.5,
      data.radiusBottom !== undefined ? data.radiusBottom : 0.5,
      h,
      data.radialSegments || 16
    );
    var mesh = new THREE.Mesh(geo, mats);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'cylinder');
  }

  // -------------------------------------------------------
  // SPHERE — SphereGeometry with single material
  // Pivot at (x, y, z) = center
  // -------------------------------------------------------
  function buildSphere(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'sphere');
    var geo = new THREE.SphereGeometry(
      data.radius || 0.5,
      data.widthSegments || 16,
      data.heightSegments || 12
    );
    var mesh = new THREE.Mesh(geo, mats[0]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'sphere');
  }

  // -------------------------------------------------------
  // PLANE — PlaneGeometry with single material
  // Pivot at (x, y, z); faces 'up', 'front', or 'right'
  // -------------------------------------------------------
  function buildPlane(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'plane');
    var geo = new THREE.PlaneGeometry(data.w || 2, data.h || 2);
    var mat = mats[0];
    if (data.doubleSide) mat.side = THREE.DoubleSide;

    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;

    var facing = data.facing || 'up';
    if (facing === 'up') {
      mesh.rotation.x = -Math.PI / 2;
    } else if (facing === 'right') {
      mesh.rotation.y = Math.PI / 2;
    }
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'plane');
  }

  // -------------------------------------------------------
  // EMPTY — Wireframe cross helper (editor-visible only)
  // Used for lights, models, spawns, sounds, etc. via behaviors
  // -------------------------------------------------------
  function buildEmpty(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    // Wireframe cross (3 axis lines)
    var size = 0.5;
    var helperMat = new THREE.LineBasicMaterial({ color: 0xFFAA00, depthTest: false, transparent: true, opacity: 0.6 });
    var pts = [
      new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0),
      new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0),
      new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, size)
    ];
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.LineSegments(geo, helperMat);
    line.userData.isHelper = true;
    group.add(line);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'empty');
  }

  // -------------------------------------------------------
  // CONE — CylinderGeometry with radiusTop=0
  // Pivot at (x, y, z) = center of base
  // -------------------------------------------------------
  function buildCone(data) {
    var group = new THREE.Group();
    var h = data.height || 2;
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'cone');
    var geo = new THREE.CylinderGeometry(
      0,
      data.radiusBottom !== undefined ? data.radiusBottom : 0.5,
      h,
      data.radialSegments || 16
    );
    var mesh = new THREE.Mesh(geo, mats);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'cone');
  }

  // -------------------------------------------------------
  // WEDGE — Custom triangular prism (ramp)
  // Base-positioned: y=0 is floor, slope from top-back to bottom-front
  // -------------------------------------------------------
  function buildWedge(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var w = data.w || 2;
    var h = data.h || 2;
    var d = data.d || 2;
    var hw = w / 2;
    var hd = d / 2;

    var geo = new THREE.BufferGeometry();
    var slopeLen = Math.sqrt(d * d + h * h);
    var snY = d / slopeLen;
    var snZ = h / slopeLen;

    // Vertices and normals for each face
    var positions = [];
    var normals = [];
    var uvs = [];

    // Slope face (2 tris): top-back edge to bottom-front edge
    // v0=(-hw,h,-hd), v1=(hw,h,-hd), v2=(hw,0,hd), v3=(-hw,0,hd)
    positions.push(-hw,h,-hd, hw,h,-hd, hw,0,hd, -hw,h,-hd, hw,0,hd, -hw,0,hd);
    for (var si=0; si<6; si++) normals.push(0, snY, snZ);
    uvs.push(0,1, 1,1, 1,0, 0,1, 1,0, 0,0);

    // Bottom face (2 tris): y=0 plane
    // v0=(-hw,0,-hd), v1=(hw,0,-hd), v2=(hw,0,hd), v3=(-hw,0,hd)
    positions.push(-hw,0,hd, hw,0,hd, hw,0,-hd, -hw,0,hd, hw,0,-hd, -hw,0,-hd);
    for (var bi=0; bi<6; bi++) normals.push(0, -1, 0);
    uvs.push(0,0, 1,0, 1,1, 0,0, 1,1, 0,1);

    // Back face (2 tris): z=-hd, full rectangle
    // v0=(-hw,0,-hd), v1=(hw,0,-hd), v2=(hw,h,-hd), v3=(-hw,h,-hd)
    positions.push(-hw,0,-hd, hw,0,-hd, hw,h,-hd, -hw,0,-hd, hw,h,-hd, -hw,h,-hd);
    for (var bki=0; bki<6; bki++) normals.push(0, 0, -1);
    uvs.push(0,0, 1,0, 1,1, 0,0, 1,1, 0,1);

    // Left face (1 tri): x=-hw triangle
    // v0=(-hw,0,-hd), v1=(-hw,h,-hd), v2=(-hw,0,hd)
    positions.push(-hw,0,-hd, -hw,h,-hd, -hw,0,hd);
    for (var li=0; li<3; li++) normals.push(-1, 0, 0);
    uvs.push(0,0, 0,1, 1,0);

    // Right face (1 tri): x=+hw triangle
    // v0=(hw,0,-hd), v1=(hw,0,hd), v2=(hw,h,-hd)
    positions.push(hw,0,-hd, hw,0,hd, hw,h,-hd);
    for (var ri=0; ri<3; ri++) normals.push(1, 0, 0);
    uvs.push(0,0, 1,0, 0,1);

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    // Material groups: slope=0, bottom=1, back=2, left=3, right=4
    geo.addGroup(0, 6, 0);   // slope
    geo.addGroup(6, 6, 1);   // bottom
    geo.addGroup(12, 6, 2);  // back
    geo.addGroup(18, 3, 3);  // left
    geo.addGroup(21, 3, 4);  // right

    var mats = FaceMaterial.createArray(data.faces, 'wedge');
    var mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'wedge');
  }

  // -------------------------------------------------------
  // TORUS — TorusGeometry with single material
  // Center-positioned
  // -------------------------------------------------------
  function buildTorus(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var mats = FaceMaterial.createArray(data.faces, 'torus');
    var geo = new THREE.TorusGeometry(
      data.radius || 1,
      data.tube || 0.3,
      data.radialSegments || 16,
      data.tubularSegments || 32
    );
    var mesh = new THREE.Mesh(geo, mats[0]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'torus');
  }

  // -------------------------------------------------------
  // STAIRS — Procedural N-step staircase
  // Base-positioned: y=0 is floor, steps go up along +Z
  // -------------------------------------------------------
  function buildStairs(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var w = data.w || 2;
    var h = data.h || 2;
    var d = data.d || 4;
    var steps = data.steps || 8;
    var stepH = h / steps;
    var stepD = d / steps;

    var mats = FaceMaterial.createArray(data.faces, 'stairs');
    var mat = mats[0];

    for (var i = 0; i < steps; i++) {
      var sh = stepH * (i + 1);
      var geo = new THREE.BoxGeometry(w, sh, stepD);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, sh / 2, i * stepD + stepD / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    group.rotation.set(data.rotX || 0, data.rotY || 0, data.rotZ || 0);
    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'stairs');
  }

  // -------------------------------------------------------
  // BEHAVIOR APPLICATORS
  // Iterates data.behaviors and adds child objects/markers
  // -------------------------------------------------------
  function applyBehaviors(group, data) {
    if (!data.behaviors) return;
    for (var i = 0; i < data.behaviors.length; i++) {
      var beh = data.behaviors[i];
      switch (beh.type) {
        case 'collision':
          // No visual — collision is handled by collision.js
          break;
        case 'light':
          applyLightBehavior(group, beh, data);
          break;
        case 'sound':
          applySoundBehavior(group, beh);
          break;
        case 'model':
          applyModelBehavior(group, beh, data);
          break;
        case 'spawn':
          applySpawnBehavior(group);
          break;
        case 'npc':
          applyNpcBehavior(group);
          break;
        case 'interactable':
          applyInteractableBehavior(group);
          break;
      }
    }
  }

  // --- Light behavior ---
  function applyLightBehavior(group, beh, data) {
    var color = beh.color ? (typeof beh.color === 'string' ? SceneSchema.parseColor(beh.color) : beh.color) : 0xFFFFFF;
    var intensity = beh.intensity !== undefined ? beh.intensity : 1.0;
    var lightType = beh.lightType || 'point';

    var light;
    if (lightType === 'point') {
      light = new THREE.PointLight(color, intensity, beh.distance || 20);
      if (beh.castShadow) { light.castShadow = true; light.shadow.mapSize.set(512, 512); }
      group.add(light);
    } else if (lightType === 'spot') {
      light = new THREE.SpotLight(color, intensity, beh.distance || 20, Math.PI / 6);
      if (beh.castShadow) { light.castShadow = true; light.shadow.mapSize.set(512, 512); }
      group.add(light);
      group.add(light.target);
    } else if (lightType === 'directional') {
      light = new THREE.DirectionalLight(color, intensity);
      if (beh.castShadow) {
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 50;
        light.shadow.camera.left = -20;
        light.shadow.camera.right = 20;
        light.shadow.camera.top = 20;
        light.shadow.camera.bottom = -20;
      }
      group.add(light);
      group.add(light.target);
    } else if (lightType === 'ambient') {
      light = new THREE.AmbientLight(color, intensity);
      group.add(light);
    }

    // Wireframe helper (diamond)
    var helperGeo = new THREE.OctahedronGeometry(0.3);
    var helperMat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 });
    var helperMesh = new THREE.Mesh(helperGeo, helperMat);
    helperMesh.userData.isHelper = true;
    group.add(helperMesh);

    // Range ring for point/spot
    if ((lightType === 'point' || lightType === 'spot') && beh.distance) {
      var ringGeo = new THREE.RingGeometry(beh.distance - 0.05, beh.distance, 32);
      var ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthTest: false });
      var ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = -(data.y || 0);
      ringMesh.userData.isHelper = true;
      group.add(ringMesh);
    }
  }

  // --- Sound behavior ---
  function applySoundBehavior(group, beh) {
    var speakerMat = new THREE.MeshBasicMaterial({ color: 0x4488FF, transparent: true, opacity: 0.7, depthTest: false });

    var boxGeo = new THREE.BoxGeometry(0.3, 0.3, 0.2);
    var boxMesh = new THREE.Mesh(boxGeo, speakerMat);
    boxMesh.position.y = 0.15;
    boxMesh.userData.isHelper = true;
    group.add(boxMesh);

    var coneGeo = new THREE.ConeGeometry(0.2, 0.3, 8, 1, true);
    var coneMat = new THREE.MeshBasicMaterial({ color: 0x66AAFF, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false, wireframe: true });
    var coneMesh = new THREE.Mesh(coneGeo, coneMat);
    coneMesh.rotation.z = -Math.PI / 2;
    coneMesh.position.set(0.25, 0.15, 0);
    coneMesh.userData.isHelper = true;
    group.add(coneMesh);

    // Range ring
    var range = beh.refDistance || 5;
    var ringGeo = new THREE.RingGeometry(range - 0.05, range + 0.05, 32);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x4488FF, side: THREE.DoubleSide, transparent: true, opacity: 0.15, depthTest: false });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.01;
    ringMesh.userData.isHelper = true;
    group.add(ringMesh);
  }

  // --- Model behavior ---
  function applyModelBehavior(group, beh, data) {
    var url = beh.url;
    var scale = beh.scale || 1;

    if (!url) {
      addModelPlaceholder(group);
      return;
    }

    if (gltfCache[url]) {
      applyModelFromCache(group, data, gltfCache[url], beh);
    } else {
      var placeholder = addModelPlaceholder(group);
      var loader = getGLTFLoader();
      if (!loader) return;

      loader.load(url,
        function(gltf) {
          gltfCache[url] = gltf.scene;
          if (placeholder && placeholder.parent) {
            group.remove(placeholder);
            if (placeholder.geometry) placeholder.geometry.dispose();
            if (placeholder.material) placeholder.material.dispose();
          }
          applyModelFromCache(group, data, gltf.scene, beh);
        },
        null,
        function(err) { console.error('[Builder] Failed to load model: ' + url, err); }
      );
    }
  }

  function addModelPlaceholder(group) {
    var geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    var phMat = new THREE.MeshBasicMaterial({ color: 0xFF8800, wireframe: true, depthTest: false, transparent: true, opacity: 0.6 });
    var mesh = new THREE.Mesh(geo, phMat);
    mesh.position.y = 0.25;
    mesh.userData.isHelper = true;
    group.add(mesh);
    return mesh;
  }

  function applyModelFromCache(group, data, cachedScene, beh) {
    var clone = cachedScene.clone();
    var userScale = beh.scale || 1;

    // Auto-normalize: compute bounding box and scale so largest dimension ≈ 2 units
    var box = new THREE.Box3().setFromObject(clone);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    var normalizeScale = (maxDim > 0.01) ? (2.0 / maxDim) : 1;

    var finalScale = normalizeScale * userScale;
    clone.scale.set(finalScale, finalScale, finalScale);

    clone.traverse(function(child) {
      child.userData.sceneId = data.id;
      child.userData.sceneType = data.primitive;
      if (child.isMesh && beh.castShadow) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(clone);
  }

  // --- Spawn behavior ---
  function applySpawnBehavior(group) {
    var bodyMat = new THREE.MeshBasicMaterial({ color: 0x22DD44, transparent: true, opacity: 0.6, depthTest: false });

    var bodyGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8);
    var bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.7;
    bodyMesh.userData.isHelper = true;
    group.add(bodyMesh);

    var headGeo = new THREE.SphereGeometry(0.22, 8, 6);
    var headMesh = new THREE.Mesh(headGeo, bodyMat);
    headMesh.position.y = 1.4;
    headMesh.userData.isHelper = true;
    group.add(headMesh);

    var arrowMat = new THREE.MeshBasicMaterial({ color: 0x44FF66, transparent: true, opacity: 0.8, depthTest: false });
    var arrowGeo = new THREE.ConeGeometry(0.15, 0.4, 6);
    var arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.x = -Math.PI / 2;
    arrowMesh.position.set(0, 0.8, -0.5);
    arrowMesh.userData.isHelper = true;
    group.add(arrowMesh);

    var ringGeo = new THREE.RingGeometry(0.4, 0.5, 16);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x22DD44, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthTest: false });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.01;
    ringMesh.userData.isHelper = true;
    group.add(ringMesh);
  }

  // --- NPC behavior ---
  function applyNpcBehavior(group) {
    var mat = new THREE.MeshBasicMaterial({ color: 0xFF8844, transparent: true, opacity: 0.5, depthTest: false });

    var bodyGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    var bodyMesh = new THREE.Mesh(bodyGeo, mat);
    bodyMesh.position.y = 0.6;
    bodyMesh.userData.isHelper = true;
    group.add(bodyMesh);

    var headGeo = new THREE.SphereGeometry(0.18, 8, 6);
    var headMesh = new THREE.Mesh(headGeo, mat);
    headMesh.position.y = 1.15;
    headMesh.userData.isHelper = true;
    group.add(headMesh);
  }

  // --- Interactable behavior ---
  function applyInteractableBehavior(group) {
    var ringGeo = new THREE.RingGeometry(0.6, 0.7, 24);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthTest: false });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.01;
    ringMesh.userData.isHelper = true;
    group.add(ringMesh);
  }

  // -------------------------------------------------------
  // TERRAIN — Heightmap mesh (PlaneGeometry remapped to XZ)
  // Centered at (x, y, z), extends ±width/2 on X, ±depth/2 on Z
  // -------------------------------------------------------

  // Height-based vertex color gradient (absolute height thresholds)
  function terrainVertexColors(heights, count) {
    var colors = new Float32Array(count * 3);
    for (var j = 0; j < count; j++) {
      var h = j < heights.length ? heights[j] : 0;
      var r, g, b;
      // Absolute height zones:
      // Below 0: dark water-ish (0.18, 0.28, 0.22)
      // 0-3: grass green
      // 3-8: brown/dirt
      // 8-15: rock grey
      // 15+: snow caps
      if (h < 0) {
        var f = Math.max(h, -5) / -5; // 0..1 over [-5, 0]
        r = 0.20 - f * 0.06;
        g = 0.35 - f * 0.10;
        b = 0.22 + f * 0.05;
      } else if (h < 3) {
        var f = h / 3;
        r = 0.20 + f * 0.15;
        g = 0.35 + f * 0.18;
        b = 0.12 + f * 0.06;
      } else if (h < 8) {
        var f = (h - 3) / 5;
        r = 0.35 + f * 0.20;
        g = 0.53 - f * 0.13;
        b = 0.18 + f * 0.07;
      } else if (h < 15) {
        var f = (h - 8) / 7;
        r = 0.55 + f * 0.05;
        g = 0.40 + f * 0.10;
        b = 0.25 + f * 0.15;
      } else {
        var f = Math.min((h - 15) / 10, 1);
        r = 0.60 + f * 0.08;
        g = 0.50 + f * 0.10;
        b = 0.40 + f * 0.10;
      }
      colors[j * 3]     = r;
      colors[j * 3 + 1] = g;
      colors[j * 3 + 2] = b;
    }
    return colors;
  }

  function buildTerrain(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var width = data.width || 100;
    var depth = data.depth || 100;
    var segments = data.segments || 64;
    var heights = data.heights || [];

    var geo = new THREE.PlaneGeometry(width, depth, segments, segments);
    var pos = geo.attributes.position;

    // PlaneGeometry is in XY plane; remap to XZ with heights
    for (var i = 0; i < pos.count; i++) {
      var origY = pos.getY(i);
      var h = i < heights.length ? heights[i] : 0;
      pos.setY(i, h);
      pos.setZ(i, -origY);
    }
    pos.needsUpdate = true;

    // Vertex colors based on height
    var colorData = terrainVertexColors(heights, pos.count);
    geo.setAttribute('color', new THREE.BufferAttribute(colorData, 3));

    geo.computeVertexNormals();

    var mats = FaceMaterial.createArray(data.faces, 'terrain');
    var mat = mats[0];
    mat.vertexColors = true;
    // Use white base so vertex colors show through cleanly
    mat.color.setRGB(1, 1, 1);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Wireframe overlay for editor visibility
    var wireMat = new THREE.MeshBasicMaterial({
      color: 0x000000, wireframe: true, transparent: true, opacity: 0.08
    });
    var wireMesh = new THREE.Mesh(geo, wireMat);
    wireMesh.userData.isWireHelper = true;
    group.add(wireMesh);

    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'terrain');
  }

  // -------------------------------------------------------
  // ROAD — Waypoint-based strip geometry with style presets
  // Origin at first waypoint, points are relative {x,z}
  // -------------------------------------------------------

  // defaultWidth in metres (1 unit = 1 m).  Real-world references:
  //   footpath/dirt track  ~1.5 m
  //   sand/gravel track    ~2–2.5 m
  //   cobblestone street   ~4 m
  //   UK B-road (2 lanes)  ~6.5 m  (3.25 m × 2)
  //   USA road  (2 lanes)  ~7.4 m  (3.7 m × 2)
  //   Roman road           ~4 m
  //   modern 2-lane        ~7 m
  var ROAD_STYLES = {
    dirt:        { color: 0x8B6B3E, roughness: 0.95, markings: null,                                                    defaultWidth: 1.5, defaultPavements: false },
    sand:        { color: 0xC2A54F, roughness: 0.90, markings: null,                                                    defaultWidth: 2,   defaultPavements: false },
    gravel:      { color: 0x7A7062, roughness: 0.95, markings: null,                                                    defaultWidth: 2.5, defaultPavements: false },
    cobblestone: { color: 0x6B6B6B, roughness: 0.85, markings: null,                                                    defaultWidth: 4,   defaultPavements: true },
    uk:          { color: 0x3A3A3A, roughness: 0.70, markings: { center: 0xFFFFFF, edge: 0xCCCC00, dashed: true },      defaultWidth: 6.5, defaultPavements: true },
    usa:         { color: 0x3A3A3A, roughness: 0.70, markings: { center: 0xFFCC00, edge: 0xFFFFFF, dashed: true },      defaultWidth: 7.5, defaultPavements: true },
    roman:       { color: 0xA89070, roughness: 0.80, markings: null,                                                    defaultWidth: 4,   defaultPavements: false },
    modern:      { color: 0x2A2A2A, roughness: 0.75, markings: { center: 0xFFFFFF, edge: null,     dashed: true },      defaultWidth: 7,   defaultPavements: true }
  };

  function buildRoad(data) {
    var group = new THREE.Group();
    group.position.set(data.x || 0, data.y || 0, data.z || 0);

    var pts = data.points;
    var width = data.width || 3;
    var halfW = width / 2;
    var styleName = data.style || 'dirt';
    var styleInfo = ROAD_STYLES[styleName] || ROAD_STYLES.dirt;
    var closed = !!data.closed;

    // If fewer than 2 points, show a small marker
    if (!pts || pts.length < 2) {
      var markerGeo = new THREE.SphereGeometry(0.3, 8, 6);
      var markerMat = new THREE.MeshBasicMaterial({ color: styleInfo.color, wireframe: true, depthTest: false, transparent: true, opacity: 0.6 });
      var markerMesh = new THREE.Mesh(markerGeo, markerMat);
      markerMesh.userData.isHelper = true;
      group.add(markerMesh);
      applyBehaviors(group, data);
      return tagGroup(group, data.id, 'road');
    }

    var N = pts.length;

    // Compute perpendicular directions at each point (miter joins)
    var lefts = [];  // left offset vectors at each point
    var rights = []; // right offset vectors

    for (var i = 0; i < N; i++) {
      var prev, next;
      if (closed) {
        prev = pts[(i - 1 + N) % N];
        next = pts[(i + 1) % N];
      } else {
        prev = (i > 0) ? pts[i - 1] : null;
        next = (i < N - 1) ? pts[i + 1] : null;
      }

      var dx1 = 0, dz1 = 0, dx2 = 0, dz2 = 0;
      if (prev) { dx1 = pts[i].x - prev.x; dz1 = pts[i].z - prev.z; }
      if (next) { dx2 = next.x - pts[i].x; dz2 = next.z - pts[i].z; }
      if (!prev) { dx1 = dx2; dz1 = dz2; }
      if (!next) { dx2 = dx1; dz2 = dz1; }

      // Normalize both segment directions
      var len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
      var len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      dx1 /= len1; dz1 /= len1;
      dx2 /= len2; dz2 /= len2;

      // Average direction
      var ax = dx1 + dx2;
      var az = dz1 + dz2;
      var al = Math.sqrt(ax * ax + az * az);
      if (al < 0.001) { ax = -dz1; az = dx1; al = 1; }
      ax /= al; az /= al;

      // Perpendicular to average direction (left = -az, ax)
      var px = -az;
      var pz = ax;

      // Miter correction: dot product of perp with segment perp
      var segPx = -dz1;
      var segPz = dx1;
      var dot = px * segPx + pz * segPz;
      var miterScale = halfW / Math.max(Math.abs(dot), 0.25);

      lefts.push({ x: px * miterScale, z: pz * miterScale });
      rights.push({ x: -px * miterScale, z: -pz * miterScale });
    }

    // Build vertex arrays for road surface
    var positions = [];
    var normals = [];
    var uvs = [];
    var indices = [];

    // Accumulated distance for UV tiling
    var accDist = 0;

    for (var vi = 0; vi < N; vi++) {
      if (vi > 0) {
        var dx3 = pts[vi].x - pts[vi - 1].x;
        var dz3 = pts[vi].z - pts[vi - 1].z;
        accDist += Math.sqrt(dx3 * dx3 + dz3 * dz3);
      }
      var p = pts[vi];
      // Left vertex
      positions.push(p.x + lefts[vi].x, 0, p.z + lefts[vi].z);
      // Right vertex
      positions.push(p.x + rights[vi].x, 0, p.z + rights[vi].z);
      // Normals all up
      normals.push(0, 1, 0, 0, 1, 0);
      // UVs: u=0 left, u=1 right, v=accumulated distance
      var vCoord = accDist / width;
      uvs.push(0, vCoord, 1, vCoord);
    }

    // Triangulate quad strip
    for (var qi = 0; qi < N - 1; qi++) {
      var a = qi * 2;
      var b = qi * 2 + 1;
      var c = (qi + 1) * 2;
      var d = (qi + 1) * 2 + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
    // Close loop if needed
    if (closed && N > 2) {
      var a2 = (N - 1) * 2;
      var b2 = (N - 1) * 2 + 1;
      indices.push(a2, 0, b2);
      indices.push(b2, 0, 1);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // Build merged face data for road surface: style defaults + data.faces.all
    var surfaceFace = { color: styleInfo.color, roughness: styleInfo.roughness, metalness: 0 };
    if (data.faces && data.faces.all) {
      var fa = data.faces.all;
      for (var fk in fa) { if (fa.hasOwnProperty(fk)) surfaceFace[fk] = fa[fk]; }
    }
    var mat = FaceMaterial.create(surfaceFace);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Road markings
    if (styleInfo.markings) {
      buildRoadMarkings(group, pts, lefts, rights, styleInfo.markings, closed, N, width);
    }

    // Raised pavements (sidewalks) on both sides
    if (data.pavements) {
      buildRoadPavements(group, pts, lefts, rights, closed, N, halfW, data);
    }

    applyBehaviors(group, data);
    return tagGroup(group, data.id, 'road');
  }

  function buildRoadMarkings(group, pts, lefts, rights, markings, closed, N, width) {
    var DASH_LEN = 2.0;   // 2 m dash  (UK standard)
    var GAP_LEN = 2.0;    // 2 m gap
    var LINE_W = 0.12;    // 12 cm line width (real markings ~10-15 cm)
    var Y_OFF = 0.005;

    // Build center line
    if (markings.center !== undefined && markings.center !== null) {
      var centerStrip = buildMarkingStrip(pts, null, null, LINE_W, Y_OFF, closed, N, markings.dashed, DASH_LEN, GAP_LEN);
      if (centerStrip) {
        var cMat = new THREE.MeshBasicMaterial({ color: markings.center, depthTest: true });
        var cMesh = new THREE.Mesh(centerStrip, cMat);
        group.add(cMesh);
      }
    }

    // Build edge lines
    if (markings.edge !== undefined && markings.edge !== null) {
      // Left edge
      var leftStrip = buildMarkingStrip(pts, lefts, null, LINE_W, Y_OFF, closed, N, false, 0, 0);
      if (leftStrip) {
        var lMat = new THREE.MeshBasicMaterial({ color: markings.edge, depthTest: true });
        var lMesh = new THREE.Mesh(leftStrip, lMat);
        group.add(lMesh);
      }
      // Right edge
      var rightStrip = buildMarkingStrip(pts, null, rights, LINE_W, Y_OFF, closed, N, false, 0, 0);
      if (rightStrip) {
        var rMat = new THREE.MeshBasicMaterial({ color: markings.edge, depthTest: true });
        var rMesh = new THREE.Mesh(rightStrip, rMat);
        group.add(rMesh);
      }
    }
  }

  // Build a thin strip along the road center or edge
  // If offsets is null, strip goes down center of points
  // If leftOff provided, strip follows left edge; if rightOff provided, follows right edge
  function buildMarkingStrip(pts, leftOff, rightOff, lineW, yOff, closed, N, dashed, dashLen, gapLen) {
    if (N < 2) return null;

    // Determine center points for the strip
    var centers = [];
    for (var i = 0; i < N; i++) {
      var cx, cz;
      if (leftOff) {
        cx = pts[i].x + leftOff[i].x;
        cz = pts[i].z + leftOff[i].z;
      } else if (rightOff) {
        cx = pts[i].x + rightOff[i].x;
        cz = pts[i].z + rightOff[i].z;
      } else {
        cx = pts[i].x;
        cz = pts[i].z;
      }
      centers.push({ x: cx, z: cz });
    }

    if (!dashed) {
      // Solid line — simple strip
      return buildSolidStrip(centers, lineW, yOff, closed);
    }

    // Dashed: build segments
    var allPositions = [];
    var allNormals = [];
    var allIndices = [];
    var vertOffset = 0;
    var accDist = 0;
    var inDash = true;

    for (var si = 0; si < N - 1; si++) {
      var sx = centers[si + 1].x - centers[si].x;
      var sz = centers[si + 1].z - centers[si].z;
      var segLen = Math.sqrt(sx * sx + sz * sz);
      if (segLen < 0.001) continue;

      var dirX = sx / segLen;
      var dirZ = sz / segLen;
      var perpX = -dirZ * lineW / 2;
      var perpZ = dirX * lineW / 2;

      var traveled = 0;
      while (traveled < segLen) {
        var remaining = inDash ? (dashLen - (accDist % (dashLen + gapLen))) : (gapLen - ((accDist - dashLen) % (dashLen + gapLen)));
        if (remaining <= 0) { remaining = inDash ? dashLen : gapLen; }
        var stepLen = Math.min(remaining, segLen - traveled);

        if (inDash && stepLen > 0.01) {
          var x0 = centers[si].x + dirX * traveled;
          var z0 = centers[si].z + dirZ * traveled;
          var x1 = x0 + dirX * stepLen;
          var z1 = z0 + dirZ * stepLen;
          var vo = vertOffset;
          allPositions.push(
            x0 + perpX, yOff, z0 + perpZ,
            x0 - perpX, yOff, z0 - perpZ,
            x1 + perpX, yOff, z1 + perpZ,
            x1 - perpX, yOff, z1 - perpZ
          );
          allNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
          allIndices.push(vo, vo + 2, vo + 1, vo + 1, vo + 2, vo + 3);
          vertOffset += 4;
        }

        traveled += stepLen;
        accDist += stepLen;

        var phase = accDist % (dashLen + gapLen);
        inDash = phase < dashLen;
      }
    }

    if (allPositions.length === 0) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    geo.setIndex(allIndices);
    return geo;
  }

  function buildSolidStrip(centers, lineW, yOff, closed) {
    var N = centers.length;
    if (N < 2) return null;
    var positions = [];
    var normalsArr = [];
    var idxArr = [];
    var hw = lineW / 2;

    for (var i = 0; i < N; i++) {
      var prev = (i > 0) ? centers[i - 1] : (closed ? centers[N - 1] : null);
      var next = (i < N - 1) ? centers[i + 1] : (closed ? centers[0] : null);
      var dx1 = 0, dz1 = 0, dx2 = 0, dz2 = 0;
      if (prev) { dx1 = centers[i].x - prev.x; dz1 = centers[i].z - prev.z; }
      if (next) { dx2 = next.x - centers[i].x; dz2 = next.z - centers[i].z; }
      if (!prev) { dx1 = dx2; dz1 = dz2; }
      if (!next) { dx2 = dx1; dz2 = dz1; }
      var l1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
      var l2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      dx1 /= l1; dz1 /= l1; dx2 /= l2; dz2 /= l2;
      var px = -(dz1 + dz2);
      var pz = dx1 + dx2;
      var pl = Math.sqrt(px * px + pz * pz);
      if (pl < 0.001) { px = -dz1; pz = dx1; pl = 1; }
      px /= pl; pz /= pl;
      positions.push(centers[i].x + px * hw, yOff, centers[i].z + pz * hw);
      positions.push(centers[i].x - px * hw, yOff, centers[i].z - pz * hw);
      normalsArr.push(0, 1, 0, 0, 1, 0);
    }

    for (var qi = 0; qi < N - 1; qi++) {
      var a = qi * 2, b = qi * 2 + 1, c = (qi + 1) * 2, d = (qi + 1) * 2 + 1;
      idxArr.push(a, c, b, b, c, d);
    }
    if (closed && N > 2) {
      var a2 = (N - 1) * 2, b2 = (N - 1) * 2 + 1;
      idxArr.push(a2, 0, b2, b2, 0, 1);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsArr, 3));
    geo.setIndex(idxArr);
    return geo;
  }

  // Build raised concrete pavements (sidewalks) on both sides of a road.
  // Uses geometry groups so pavement top and kerb faces can be textured independently.
  function buildRoadPavements(group, pts, lefts, rights, closed, N, halfW, data) {
    var PAVE_W = 1.5;    // pavement width in metres
    var PAVE_H = 0.15;   // kerb/pavement height

    // Build pavement material from face data (defaults: light grey concrete)
    var paveFace = { color: 0xBBBBBB, roughness: 0.90, metalness: 0 };
    if (data.faces && data.faces.pavement) {
      var pf = data.faces.pavement;
      for (var pk in pf) { if (pf.hasOwnProperty(pk)) paveFace[pk] = pf[pk]; }
    }
    var paveMat = FaceMaterial.create(paveFace);
    paveMat.side = THREE.DoubleSide;

    // Build kerb material from face data (defaults: slightly darker grey)
    var kerbFace = { color: 0x999999, roughness: 0.85, metalness: 0 };
    if (data.faces && data.faces.kerb) {
      var kf = data.faces.kerb;
      for (var kk in kf) { if (kf.hasOwnProperty(kk)) kerbFace[kk] = kf[kk]; }
    }
    var kerbMat = FaceMaterial.create(kerbFace);
    kerbMat.side = THREE.DoubleSide;

    var sides = [
      { offsets: lefts },
      { offsets: rights }
    ];

    for (var s = 0; s < sides.length; s++) {
      var offsets = sides[s].offsets;
      var positions = [];
      var topIdx = [];     // group 0: walkable top surface (pavement mat)
      var curbIdx = [];    // group 1: inner + outer curb faces (kerb mat)

      for (var i = 0; i < N; i++) {
        var oMag = Math.sqrt(offsets[i].x * offsets[i].x + offsets[i].z * offsets[i].z);
        var miterFactor = (halfW > 0.001) ? (oMag / halfW) : 1;
        var outerMag = oMag + PAVE_W * miterFactor;
        var dirX = (oMag > 0.001) ? (offsets[i].x / oMag) : 0;
        var dirZ = (oMag > 0.001) ? (offsets[i].z / oMag) : 0;
        var innerX = pts[i].x + offsets[i].x;
        var innerZ = pts[i].z + offsets[i].z;
        var outerX = pts[i].x + dirX * outerMag;
        var outerZ = pts[i].z + dirZ * outerMag;

        // 4 vertices per waypoint:
        // v0: inner bottom (road edge, Y=0)
        // v1: inner top    (road edge, Y=PAVE_H)
        // v2: outer top    (outer edge, Y=PAVE_H)
        // v3: outer bottom (outer edge, Y=0)
        positions.push(innerX, 0,      innerZ);  // v0
        positions.push(innerX, PAVE_H, innerZ);  // v1
        positions.push(outerX, PAVE_H, outerZ);  // v2
        positions.push(outerX, 0,      outerZ);  // v3
      }

      // Build face strips between consecutive waypoints
      var limit = closed ? N : N - 1;
      for (var qi = 0; qi < limit; qi++) {
        var ni = (qi + 1) % N;
        var a = qi * 4;
        var b = ni * 4;

        // Top face (walkable surface) → group 0 (pavement)
        topIdx.push(a + 1, b + 1, a + 2);
        topIdx.push(a + 2, b + 1, b + 2);

        // Inner curb face → group 1 (kerb)
        curbIdx.push(a + 0, b + 0, a + 1);
        curbIdx.push(a + 1, b + 0, b + 1);

        // Outer edge face → group 1 (kerb)
        curbIdx.push(a + 2, b + 2, a + 3);
        curbIdx.push(a + 3, b + 2, b + 3);
      }

      // Merge indices with geometry groups
      var allIndices = topIdx.concat(curbIdx);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(allIndices);
      geo.addGroup(0, topIdx.length, 0);                    // pavement mat
      geo.addGroup(topIdx.length, curbIdx.length, 1);       // kerb mat
      geo.computeVertexNormals();

      var mesh = new THREE.Mesh(geo, [paveMat, kerbMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  var api = {
    buildBox: buildBox,
    buildCylinder: buildCylinder,
    buildSphere: buildSphere,
    buildPlane: buildPlane,
    buildCone: buildCone,
    buildWedge: buildWedge,
    buildTorus: buildTorus,
    buildStairs: buildStairs,
    buildTerrain: buildTerrain,
    buildRoad: buildRoad,
    buildEmpty: buildEmpty,
    tagGroup: tagGroup,
    terrainVertexColors: terrainVertexColors,
    ROAD_STYLES: ROAD_STYLES
  };

  // Auto-register builders with Engine now that BuilderSingle is defined
  if (typeof Engine !== 'undefined' && Engine.registerDefaultBuilders) {
    Engine.registerDefaultBuilders();
  }

  return api;
})();
