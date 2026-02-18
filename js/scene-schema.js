// ============================================================
// SCENE-SCHEMA — 5-primitive type definitions, face materials,
//                behavior schemas, validation
// ============================================================

var SceneSchema = (function() {
  'use strict';

  // --- 5 core primitive types ---
  var TYPES = {
    box: {
      prefix: 'box',
      fields: [
        { key: 'id',  label: 'ID',       type: 'text',   readOnly: true },
        { key: 'tag', label: 'Tag',      type: 'text' },
        { key: 'x',   label: 'X',        type: 'number', step: 0.5 },
        { key: 'y',   label: 'Y',        type: 'number', step: 0.5 },
        { key: 'z',   label: 'Z',        type: 'number', step: 0.5 },
        { key: 'w',   label: 'Width',    type: 'number', step: 0.5, min: 0.01 },
        { key: 'h',   label: 'Height',   type: 'number', step: 0.5, min: 0.01 },
        { key: 'd',   label: 'Depth',    type: 'number', step: 0.5, min: 0.01 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'w', 'h', 'd'],
      defaults: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25A1',
      paletteLabel: 'Box',
      paletteDefaults: { w: 2, h: 2, d: 2 }
    },

    cylinder: {
      prefix: 'cyl',
      fields: [
        { key: 'id',             label: 'ID',            type: 'text',   readOnly: true },
        { key: 'tag',            label: 'Tag',           type: 'text' },
        { key: 'x',              label: 'X',             type: 'number', step: 0.5 },
        { key: 'y',              label: 'Y',             type: 'number', step: 0.5 },
        { key: 'z',              label: 'Z',             type: 'number', step: 0.5 },
        { key: 'radiusTop',      label: 'Radius Top',    type: 'number', step: 0.05, min: 0 },
        { key: 'radiusBottom',   label: 'Radius Bottom', type: 'number', step: 0.05, min: 0.01 },
        { key: 'height',         label: 'Height',        type: 'number', step: 0.1, min: 0.01 },
        { key: 'radialSegments', label: 'Segments',      type: 'number', step: 1, min: 3 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'radiusBottom', 'height'],
      defaults: { x: 0, y: 0, z: 0, radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 16, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u2296',
      paletteLabel: 'Cylinder',
      paletteDefaults: { radiusTop: 0.5, radiusBottom: 0.5, height: 2 }
    },

    plane: {
      prefix: 'pln',
      fields: [
        { key: 'id',         label: 'ID',          type: 'text',   readOnly: true },
        { key: 'tag',        label: 'Tag',         type: 'text' },
        { key: 'x',          label: 'X',           type: 'number', step: 0.5 },
        { key: 'y',          label: 'Y',           type: 'number', step: 0.5 },
        { key: 'z',          label: 'Z',           type: 'number', step: 0.5 },
        { key: 'w',          label: 'Width',       type: 'number', step: 0.5, min: 0.01 },
        { key: 'h',          label: 'Height',      type: 'number', step: 0.5, min: 0.01 },
        { key: 'facing',     label: 'Facing',      type: 'select', options: ['up', 'front', 'right'] },
        { key: 'doubleSide', label: 'Double Side',  type: 'checkbox' },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'w', 'h'],
      defaults: { x: 0, y: 0, z: 0, w: 2, h: 2, facing: 'up', doubleSide: false, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25AD',
      paletteLabel: 'Plane',
      paletteDefaults: { w: 4, h: 4, facing: 'up' }
    },

    sphere: {
      prefix: 'sph',
      fields: [
        { key: 'id',             label: 'ID',         type: 'text',   readOnly: true },
        { key: 'tag',            label: 'Tag',        type: 'text' },
        { key: 'x',              label: 'X',          type: 'number', step: 0.5 },
        { key: 'y',              label: 'Y',          type: 'number', step: 0.5 },
        { key: 'z',              label: 'Z',          type: 'number', step: 0.5 },
        { key: 'radius',         label: 'Radius',     type: 'number', step: 0.1, min: 0.01 },
        { key: 'widthSegments',  label: 'W Segments',  type: 'number', step: 1, min: 3 },
        { key: 'heightSegments', label: 'H Segments',  type: 'number', step: 1, min: 2 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'radius'],
      defaults: { x: 0, y: 0, z: 0, radius: 0.5, widthSegments: 16, heightSegments: 12, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25CB',
      paletteLabel: 'Sphere',
      paletteDefaults: { radius: 1 }
    },

    cone: {
      prefix: 'con',
      fields: [
        { key: 'id',             label: 'ID',            type: 'text',   readOnly: true },
        { key: 'tag',            label: 'Tag',           type: 'text' },
        { key: 'x',              label: 'X',             type: 'number', step: 0.5 },
        { key: 'y',              label: 'Y',             type: 'number', step: 0.5 },
        { key: 'z',              label: 'Z',             type: 'number', step: 0.5 },
        { key: 'radiusBottom',   label: 'Radius',        type: 'number', step: 0.05, min: 0.01 },
        { key: 'height',         label: 'Height',        type: 'number', step: 0.1, min: 0.01 },
        { key: 'radialSegments', label: 'Segments',      type: 'number', step: 1, min: 3 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'radiusBottom', 'height'],
      defaults: { x: 0, y: 0, z: 0, radiusBottom: 0.5, height: 2, radialSegments: 16, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25B3',
      paletteLabel: 'Cone',
      paletteDefaults: { radiusBottom: 0.5, height: 2 }
    },

    wedge: {
      prefix: 'wdg',
      fields: [
        { key: 'id',  label: 'ID',     type: 'text',   readOnly: true },
        { key: 'tag', label: 'Tag',    type: 'text' },
        { key: 'x',   label: 'X',      type: 'number', step: 0.5 },
        { key: 'y',   label: 'Y',      type: 'number', step: 0.5 },
        { key: 'z',   label: 'Z',      type: 'number', step: 0.5 },
        { key: 'w',   label: 'Width',  type: 'number', step: 0.5, min: 0.01 },
        { key: 'h',   label: 'Height', type: 'number', step: 0.5, min: 0.01 },
        { key: 'd',   label: 'Depth',  type: 'number', step: 0.5, min: 0.01 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'w', 'h', 'd'],
      defaults: { x: 0, y: 0, z: 0, w: 2, h: 2, d: 2, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25E5',
      paletteLabel: 'Wedge',
      paletteDefaults: { w: 2, h: 2, d: 4 }
    },

    torus: {
      prefix: 'tor',
      fields: [
        { key: 'id',              label: 'ID',             type: 'text',   readOnly: true },
        { key: 'tag',             label: 'Tag',            type: 'text' },
        { key: 'x',               label: 'X',              type: 'number', step: 0.5 },
        { key: 'y',               label: 'Y',              type: 'number', step: 0.5 },
        { key: 'z',               label: 'Z',              type: 'number', step: 0.5 },
        { key: 'radius',          label: 'Radius',         type: 'number', step: 0.1, min: 0.01 },
        { key: 'tube',            label: 'Tube',           type: 'number', step: 0.05, min: 0.01 },
        { key: 'radialSegments',  label: 'Radial Segs',    type: 'number', step: 1, min: 3 },
        { key: 'tubularSegments', label: 'Tubular Segs',   type: 'number', step: 1, min: 3 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'radius'],
      defaults: { x: 0, y: 0, z: 0, radius: 1, tube: 0.3, radialSegments: 16, tubularSegments: 32, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u25EF',
      paletteLabel: 'Torus',
      paletteDefaults: { radius: 1, tube: 0.3 }
    },

    stairs: {
      prefix: 'str',
      fields: [
        { key: 'id',    label: 'ID',     type: 'text',   readOnly: true },
        { key: 'tag',   label: 'Tag',    type: 'text' },
        { key: 'x',     label: 'X',      type: 'number', step: 0.5 },
        { key: 'y',     label: 'Y',      type: 'number', step: 0.5 },
        { key: 'z',     label: 'Z',      type: 'number', step: 0.5 },
        { key: 'w',     label: 'Width',  type: 'number', step: 0.5, min: 0.01 },
        { key: 'h',     label: 'Height', type: 'number', step: 0.5, min: 0.01 },
        { key: 'd',     label: 'Depth',  type: 'number', step: 0.5, min: 0.01 },
        { key: 'steps', label: 'Steps',  type: 'number', step: 1, min: 2 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id', 'w', 'h', 'd', 'steps'],
      defaults: { x: 0, y: 0, z: 0, w: 2, h: 2, d: 4, steps: 8, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u2587',
      paletteLabel: 'Stairs',
      paletteDefaults: { w: 2, h: 2, d: 4, steps: 8 }
    },

    terrain: {
      prefix: 'ter',
      fields: [
        { key: 'id',       label: 'ID',       type: 'text',   readOnly: true },
        { key: 'tag',      label: 'Tag',      type: 'text' },
        { key: 'x',        label: 'X',        type: 'number', step: 0.5 },
        { key: 'y',        label: 'Y',        type: 'number', step: 0.5 },
        { key: 'z',        label: 'Z',        type: 'number', step: 0.5 },
        { key: 'width',    label: 'Width',    type: 'number', step: 1, min: 1 },
        { key: 'depth',    label: 'Depth',    type: 'number', step: 1, min: 1 },
        { key: 'segments', label: 'Segments', type: 'number', step: 1, min: 4 }
      ],
      required: ['id', 'width', 'depth', 'segments'],
      defaults: { x: 50, y: 0, z: 50, width: 100, depth: 100, segments: 64 },
      paletteIcon: '\u26F0',
      paletteLabel: 'Terrain',
      paletteDefaults: { width: 100, depth: 100, segments: 64 }
    },

    road: {
      prefix: 'rd',
      fields: [
        { key: 'id',     label: 'ID',          type: 'text',   readOnly: true },
        { key: 'tag',    label: 'Tag',         type: 'text' },
        { key: 'x',      label: 'X',           type: 'number', step: 0.5 },
        { key: 'y',      label: 'Y',           type: 'number', step: 0.5 },
        { key: 'z',      label: 'Z',           type: 'number', step: 0.5 },
        { key: 'width',  label: 'Width',       type: 'number', step: 0.5, min: 0.5 },
        { key: 'style',  label: 'Style',       type: 'select', options: ['dirt','sand','gravel','cobblestone','uk','usa','roman','modern'] },
        { key: 'closed', label: 'Closed Loop', type: 'checkbox' },
        { key: 'pavements', label: 'Pavements', type: 'checkbox' }
      ],
      required: ['id', 'width', 'style'],
      defaults: { x: 0, y: 0.02, z: 0, width: 1.5, style: 'dirt', closed: false, pavements: false },
      paletteLabel: 'Road',
      paletteDefaults: { width: 1.5, style: 'dirt' }
    },

    empty: {
      prefix: 'emp',
      fields: [
        { key: 'id',  label: 'ID',       type: 'text',   readOnly: true },
        { key: 'tag', label: 'Tag',      type: 'text' },
        { key: 'x',   label: 'X',        type: 'number', step: 0.5 },
        { key: 'y',   label: 'Y',        type: 'number', step: 0.5 },
        { key: 'z',   label: 'Z',        type: 'number', step: 0.5 },
        { key: 'rotX', label: 'Rot X', type: 'number', step: 0.1 },
        { key: 'rotY', label: 'Rot Y', type: 'number', step: 0.1 },
        { key: 'rotZ', label: 'Rot Z', type: 'number', step: 0.1 }
      ],
      required: ['id'],
      defaults: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
      paletteIcon: '\u2B1A',
      paletteLabel: 'Empty',
      paletteDefaults: {}
    }
  };

  // --- Face keys per primitive ---
  var FACE_KEYS = {
    box:      ['all', 'top', 'bottom', 'front', 'back', 'left', 'right'],
    cylinder: ['all', 'side', 'top', 'bottom'],
    cone:     ['all', 'side', 'bottom'],
    sphere:   ['all'],
    torus:    ['all'],
    plane:    ['all'],
    wedge:    ['all', 'slope', 'bottom', 'back', 'left', 'right'],
    stairs:   ['all'],
    terrain:  ['all'],
    road:     ['all', 'pavement', 'kerb'],
    empty:    []
  };

  // --- Per-face PBR material field definitions ---
  var FACE_MATERIAL_SCHEMA = [
    { key: 'color',            label: 'Color',           type: 'color' },
    { key: 'roughness',        label: 'Roughness',       type: 'number', step: 0.05, min: 0, max: 1 },
    { key: 'metalness',        label: 'Metalness',       type: 'number', step: 0.05, min: 0, max: 1 },
    { key: 'map',              label: 'Texture',         type: 'texture' },
    { key: 'normalMap',        label: 'Normal Map',      type: 'texture' },
    { key: 'roughnessMap',     label: 'Roughness Map',   type: 'texture' },
    { key: 'emissive',         label: 'Emissive',        type: 'color' },
    { key: 'emissiveIntensity',label: 'Emissive Int.',   type: 'number', step: 0.1, min: 0, max: 10 },
    { key: 'opacity',          label: 'Opacity',         type: 'number', step: 0.05, min: 0, max: 1 },
    { key: 'uvScaleX',         label: 'UV Scale X',      type: 'number', step: 0.1, min: 0.01 },
    { key: 'uvScaleY',         label: 'UV Scale Y',      type: 'number', step: 0.1, min: 0.01 },
    { key: 'uvOffsetX',        label: 'UV Offset X',     type: 'number', step: 0.1 },
    { key: 'uvOffsetY',        label: 'UV Offset Y',     type: 'number', step: 0.1 }
  ];

  // --- Behavior schemas ---
  var BEHAVIOR_SCHEMAS = {
    collision: {
      label: 'Collision',
      icon: '\u25A3',
      fields: []
    },
    light: {
      label: 'Light',
      icon: '\u2600',
      fields: [
        { key: 'lightType',  label: 'Type',        type: 'select', options: ['point', 'spot', 'directional', 'ambient'] },
        { key: 'color',      label: 'Color',       type: 'color' },
        { key: 'intensity',  label: 'Intensity',    type: 'number', step: 0.1, min: 0 },
        { key: 'distance',   label: 'Distance',     type: 'number', step: 1, min: 0 },
        { key: 'castShadow', label: 'Cast Shadow',  type: 'checkbox' }
      ],
      defaults: { lightType: 'point', color: '0xFFFFFF', intensity: 1.0, distance: 20, castShadow: false }
    },
    sound: {
      label: 'Sound',
      icon: '\u266B',
      fields: [
        { key: 'src',         label: 'Audio URL',    type: 'text' },
        { key: 'volume',      label: 'Volume',       type: 'number', step: 0.1, min: 0, max: 1 },
        { key: 'refDistance',  label: 'Ref Distance', type: 'number', step: 1, min: 0.1 },
        { key: 'maxDistance',  label: 'Max Distance', type: 'number', step: 1, min: 1 },
        { key: 'loop',        label: 'Loop',         type: 'checkbox' },
        { key: 'autoplay',    label: 'Autoplay',     type: 'checkbox' }
      ],
      defaults: { src: '', volume: 1, refDistance: 5, maxDistance: 50, loop: true, autoplay: true }
    },
    model: {
      label: 'Model',
      icon: '\u2B22',
      fields: [
        { key: 'url',        label: 'Model URL',   type: 'text' },
        { key: 'scale',      label: 'Scale',       type: 'number', step: 0.1, min: 0.01 },
        { key: 'castShadow', label: 'Cast Shadow', type: 'checkbox' }
      ],
      defaults: { url: '', scale: 1, castShadow: true }
    },
    spawn: {
      label: 'Spawn',
      icon: '\u2691',
      fields: []
    },
    npc: {
      label: 'NPC',
      icon: '\u2192',
      fields: [
        { key: 'walkSpeed',     label: 'Walk Speed',     type: 'number', step: 0.1, min: 0.1 },
        { key: 'browseChance',  label: 'Browse Chance',  type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'maxNpcs',       label: 'Max NPCs',       type: 'number', step: 1, min: 1 },
        { key: 'spawnInterval', label: 'Spawn Interval', type: 'number', step: 0.5, min: 0.5 }
      ],
      defaults: { walkSpeed: 1.2, browseChance: 0.35, maxNpcs: 4, spawnInterval: 3 }
    },
    interactable: {
      label: 'Interactable',
      icon: '\u270B',
      fields: [
        { key: 'action', label: 'Action', type: 'text' }
      ],
      defaults: { action: '' }
    }
  };

  // --- Flat section: all objects in one array ---
  function getSections() {
    return { objects: null };
  }

  function getSectionForType(type) {
    if (TYPES[type]) return 'objects';
    return null;
  }

  function getTypeNames() {
    var names = [];
    for (var t in TYPES) names.push(t);
    return names;
  }

  function getFaceKeys(primitive) {
    return FACE_KEYS[primitive] || [];
  }

  function getBehaviorSchema(type) {
    return BEHAVIOR_SCHEMAS[type] || null;
  }

  function getAvailableBehaviors() {
    var names = [];
    for (var b in BEHAVIOR_SCHEMAS) names.push(b);
    return names;
  }

  // Validate a single object
  function validate(type, obj) {
    var schema = TYPES[type];
    if (!schema) return { valid: false, errors: ['Unknown primitive: ' + type] };
    var errors = [];
    for (var i = 0; i < schema.required.length; i++) {
      var key = schema.required[i];
      if (obj[key] === undefined || obj[key] === null || obj[key] === '') {
        errors.push('Missing required field: ' + key);
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // Validate entire scene (format v2: flat objects array)
  function validateScene(data) {
    var errors = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Scene data must be an object'] };
    }
    var objects = data.objects;
    if (!objects) return { valid: true, errors: [] };
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var prim = obj.primitive;
      if (!prim) {
        errors.push('objects[' + i + ']: Missing primitive type');
        continue;
      }
      var result = validate(prim, obj);
      if (!result.valid) {
        for (var j = 0; j < result.errors.length; j++) {
          errors.push('objects[' + i + ']: ' + result.errors[j]);
        }
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // Apply defaults to an object
  function applyDefaults(type, obj) {
    var schema = TYPES[type];
    if (!schema) return obj;
    // Backward-compat: migrate old single rot → rotY
    if (obj.rot !== undefined && obj.rotY === undefined) {
      obj.rotY = obj.rot;
      delete obj.rot;
    }
    var defaults = schema.defaults;
    for (var key in defaults) {
      if (obj[key] === undefined) {
        obj[key] = defaults[key];
      }
    }
    // Ensure faces and behaviors exist
    if (!obj.faces) obj.faces = {};
    if (!obj.behaviors) obj.behaviors = [];
    if (!obj.scripts) obj.scripts = [];
    return obj;
  }

  // Parse a hex color string like "0xRRGGBB" to integer
  function parseColor(str) {
    if (typeof str === 'number') return str;
    if (typeof str === 'string') {
      str = str.replace(/^#/, '0x');
      return parseInt(str, 16);
    }
    return 0;
  }

  // Format integer color to hex string
  function formatColor(num) {
    return '0x' + ('000000' + num.toString(16).toUpperCase()).slice(-6);
  }

  return {
    TYPES: TYPES,
    FACE_KEYS: FACE_KEYS,
    FACE_MATERIAL_SCHEMA: FACE_MATERIAL_SCHEMA,
    BEHAVIOR_SCHEMAS: BEHAVIOR_SCHEMAS,
    getSections: getSections,
    getSectionForType: getSectionForType,
    getTypeNames: getTypeNames,
    getFaceKeys: getFaceKeys,
    getBehaviorSchema: getBehaviorSchema,
    getAvailableBehaviors: getAvailableBehaviors,
    validate: validate,
    validateScene: validateScene,
    applyDefaults: applyDefaults,
    parseColor: parseColor,
    formatColor: formatColor
  };
})();
