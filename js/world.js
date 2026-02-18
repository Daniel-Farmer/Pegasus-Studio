// ============================================================
// WORLD — Scene assembly orchestrator
// ============================================================

var World = (function() {
  'use strict';

  var parts = {};

  function build(scene) {
    var sceneData = SceneLoader.getSceneData();

    // Environment: ground, sky, lighting, fog
    if (typeof Geometry !== 'undefined') {
      parts.ground = Geometry.buildGround(scene);
      parts.sky = Geometry.buildSky(scene);
      parts.lights = Geometry.buildLighting(scene);
    } else {
      // Minimal environment
      scene.add(new THREE.AmbientLight(0x888888, 0.5));
      var dirLight = new THREE.DirectionalLight(0xFFEEDD, 1.0);
      dirLight.position.set(30, 20, 30);
      dirLight.castShadow = true;
      scene.add(dirLight);

      // Ground plane
      var groundGeo = new THREE.PlaneGeometry(200, 200);
      groundGeo.rotateX(-Math.PI / 2);
      var groundMat = new THREE.MeshStandardMaterial({ color: 0x556633, roughness: 0.9 });
      var ground = new THREE.Mesh(groundGeo, groundMat);
      ground.receiveShadow = true;
      scene.add(ground);
    }

    // Fog from scene colors
    var fogColor = 0x9AB0C0;
    if (sceneData && sceneData.colors && sceneData.colors.fog) {
      fogColor = SceneSchema.parseColor(sceneData.colors.fog);
    }
    scene.fog = new THREE.Fog(fogColor, 50, 100);

    // Build all scene objects via Engine
    if (sceneData) {
      Engine.init(scene, sceneData);
      Engine.registerDefaultBuilders();
      Engine.buildAllEditor();
    }

    // Build collision from flat objects array
    Collision.buildFromWorld();

    // NPC pedestrians
    if (typeof NPCSystem !== 'undefined') {
      NPCSystem.init(scene);
    }

    return parts;
  }

  return {
    build: build,
    getParts: function() { return parts; }
  };
})();
