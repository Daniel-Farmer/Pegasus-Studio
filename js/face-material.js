// ============================================================
// FACE-MATERIAL — PBR material factory for per-face materials
// ============================================================

var FaceMaterial = (function() {
  'use strict';

  var textureLoader = null;
  var textureCache = {}; // url -> THREE.Texture

  function getLoader() {
    if (!textureLoader) textureLoader = new THREE.TextureLoader();
    return textureLoader;
  }

  // Default gray material
  var defaultMat = null;
  function getDefault() {
    if (!defaultMat) {
      defaultMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.7, metalness: 0 });
      defaultMat._cached = true;
    }
    return defaultMat;
  }

  // Load or retrieve cached texture
  function loadTexture(url) {
    if (!url) return null;
    if (textureCache[url]) return textureCache[url];
    var tex = getLoader().load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex._shared = true;
    textureCache[url] = tex;
    return tex;
  }

  // Create a single MeshStandardMaterial from face data
  function create(faceData) {
    if (!faceData) return getDefault().clone();

    var params = {};

    // Color
    if (faceData.color !== undefined) {
      params.color = typeof faceData.color === 'string'
        ? SceneSchema.parseColor(faceData.color)
        : faceData.color;
    } else {
      params.color = 0xAAAAAA;
    }

    // PBR
    params.roughness = faceData.roughness !== undefined ? faceData.roughness : 0.7;
    params.metalness = faceData.metalness !== undefined ? faceData.metalness : 0;

    // Emissive
    if (faceData.emissive !== undefined) {
      params.emissive = typeof faceData.emissive === 'string'
        ? SceneSchema.parseColor(faceData.emissive)
        : faceData.emissive;
      params.emissiveIntensity = faceData.emissiveIntensity !== undefined ? faceData.emissiveIntensity : 1.0;
    }

    // Opacity
    if (faceData.opacity !== undefined && faceData.opacity < 1.0) {
      params.transparent = true;
      params.opacity = faceData.opacity;
      params.depthWrite = false;
    }

    var mat = new THREE.MeshStandardMaterial(params);

    // Texture map
    if (faceData.map) {
      mat.map = loadTexture(faceData.map);
      if (mat.map) {
        // UV transform
        if (faceData.uvScaleX || faceData.uvScaleY) {
          mat.map = mat.map.clone();
          mat.map.repeat.set(faceData.uvScaleX || 1, faceData.uvScaleY || 1);
          if (faceData.uvOffsetX || faceData.uvOffsetY) {
            mat.map.offset.set(faceData.uvOffsetX || 0, faceData.uvOffsetY || 0);
          }
        }
      }
    }

    // Normal map
    if (faceData.normalMap) {
      mat.normalMap = loadTexture(faceData.normalMap);
      if (mat.normalMap && (faceData.uvScaleX || faceData.uvScaleY)) {
        mat.normalMap = mat.normalMap.clone();
        mat.normalMap.repeat.set(faceData.uvScaleX || 1, faceData.uvScaleY || 1);
        if (faceData.uvOffsetX || faceData.uvOffsetY) {
          mat.normalMap.offset.set(faceData.uvOffsetX || 0, faceData.uvOffsetY || 0);
        }
      }
    }

    // Roughness map
    if (faceData.roughnessMap) {
      mat.roughnessMap = loadTexture(faceData.roughnessMap);
      if (mat.roughnessMap && (faceData.uvScaleX || faceData.uvScaleY)) {
        mat.roughnessMap = mat.roughnessMap.clone();
        mat.roughnessMap.repeat.set(faceData.uvScaleX || 1, faceData.uvScaleY || 1);
        if (faceData.uvOffsetX || faceData.uvOffsetY) {
          mat.roughnessMap.offset.set(faceData.uvOffsetX || 0, faceData.uvOffsetY || 0);
        }
      }
    }

    return mat;
  }

  // Box face order: [+X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)]
  var BOX_FACE_MAP = {
    right:  0,
    left:   1,
    top:    2,
    bottom: 3,
    front:  4,
    back:   5
  };

  // Cylinder face order: [side, top, bottom]
  var CYL_FACE_MAP = {
    side:   0,
    top:    1,
    bottom: 2
  };

  // Create material array from faces object for a given primitive type
  // Returns array of materials matching Three.js geometry group order
  function createArray(facesObj, primitive) {
    if (!facesObj) facesObj = {};

    var allFace = facesObj.all || null;

    if (primitive === 'box') {
      var mats = [];
      var faceNames = ['right', 'left', 'top', 'bottom', 'front', 'back'];
      for (var i = 0; i < 6; i++) {
        var specific = facesObj[faceNames[i]];
        if (specific) {
          // Merge 'all' as fallback with specific overrides
          var merged = mergeface(allFace, specific);
          mats.push(create(merged));
        } else if (allFace) {
          mats.push(create(allFace));
        } else {
          mats.push(getDefault().clone());
        }
      }
      return mats;
    }

    if (primitive === 'cylinder' || primitive === 'cone') {
      var mats = [];
      var faceNames = ['side', 'top', 'bottom'];
      for (var i = 0; i < 3; i++) {
        var specific = facesObj[faceNames[i]];
        if (specific) {
          var merged = mergeface(allFace, specific);
          mats.push(create(merged));
        } else if (allFace) {
          mats.push(create(allFace));
        } else {
          mats.push(getDefault().clone());
        }
      }
      return mats;
    }

    if (primitive === 'wedge') {
      var mats = [];
      var faceNames = ['slope', 'bottom', 'back', 'left', 'right'];
      for (var i = 0; i < 5; i++) {
        var specific = facesObj[faceNames[i]];
        if (specific) {
          var merged = mergeface(allFace, specific);
          mats.push(create(merged));
        } else if (allFace) {
          mats.push(create(allFace));
        } else {
          mats.push(getDefault().clone());
        }
      }
      return mats;
    }

    // road: 3 materials — surface (group 0), pavement (group 1), kerb (group 2)
    if (primitive === 'road') {
      var mats = [];
      var faceNames = ['all', 'pavement', 'kerb'];
      for (var i = 0; i < 3; i++) {
        var specific = (i > 0) ? facesObj[faceNames[i]] : null;
        if (specific) {
          var merged = mergeface(allFace, specific);
          mats.push(create(merged));
        } else if (allFace) {
          mats.push(create(allFace));
        } else {
          mats.push(getDefault().clone());
        }
      }
      return mats;
    }

    // sphere, plane, torus, stairs: single material
    if (allFace) {
      return [create(allFace)];
    }
    return [getDefault().clone()];
  }

  // Merge base face data with overrides
  function mergeface(base, override) {
    if (!base) return override;
    if (!override) return base;
    var merged = {};
    for (var k in base) merged[k] = base[k];
    for (var k in override) merged[k] = override[k];
    return merged;
  }

  return {
    create: create,
    createArray: createArray,
    getDefault: getDefault,
    loadTexture: loadTexture,
    BOX_FACE_MAP: BOX_FACE_MAP,
    CYL_FACE_MAP: CYL_FACE_MAP
  };
})();
