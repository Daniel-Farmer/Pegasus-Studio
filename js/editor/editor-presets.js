// ============================================================
// EDITOR-PRESETS — One-click PBR material presets
// ============================================================

var EditorPresets = (function() {
  'use strict';

  var PRESETS = [
    // --- Basic ---
    { name: 'White',         category: 'Basic', color: '0xFFFFFF', roughness: 0.8, metalness: 0 },
    { name: 'Red',           category: 'Basic', color: '0xCC2222', roughness: 0.7, metalness: 0 },
    { name: 'Blue',          category: 'Basic', color: '0x2244CC', roughness: 0.7, metalness: 0 },
    { name: 'Green',         category: 'Basic', color: '0x22AA44', roughness: 0.7, metalness: 0 },
    { name: 'Yellow',        category: 'Basic', color: '0xDDBB22', roughness: 0.7, metalness: 0 },
    { name: 'Orange',        category: 'Basic', color: '0xDD6622', roughness: 0.7, metalness: 0 },
    { name: 'Dark',          category: 'Basic', color: '0x333333', roughness: 0.9, metalness: 0 },

    // --- Metal ---
    { name: 'Brushed Steel', category: 'Metal', color: '0xAAAABB', roughness: 0.35, metalness: 0.9 },
    { name: 'Gold',          category: 'Metal', color: '0xDDAA33', roughness: 0.3, metalness: 1.0 },
    { name: 'Copper',        category: 'Metal', color: '0xBB6633', roughness: 0.35, metalness: 0.9 },
    { name: 'Chrome',        category: 'Metal', color: '0xDDDDEE', roughness: 0.1, metalness: 1.0 },
    { name: 'Bronze',        category: 'Metal', color: '0x8B6914', roughness: 0.4, metalness: 0.85 },

    // --- Glass ---
    { name: 'Clear Glass',   category: 'Glass', color: '0xFFFFFF', roughness: 0.05, metalness: 0, opacity: 0.2 },
    { name: 'Tinted Glass',  category: 'Glass', color: '0x4488AA', roughness: 0.05, metalness: 0, opacity: 0.3 },
    { name: 'Frosted Glass', category: 'Glass', color: '0xDDDDEE', roughness: 0.6, metalness: 0, opacity: 0.4 },

    // --- Natural ---
    { name: 'Concrete',      category: 'Natural', color: '0x999999', roughness: 0.95, metalness: 0 },
    { name: 'Clay',          category: 'Natural', color: '0xBB8855', roughness: 0.9, metalness: 0 },
    { name: 'Sand',          category: 'Natural', color: '0xDDCC99', roughness: 0.95, metalness: 0 },
    { name: 'Grass Green',   category: 'Natural', color: '0x558833', roughness: 0.9, metalness: 0 },
    { name: 'Stone Grey',    category: 'Natural', color: '0x777788', roughness: 0.85, metalness: 0 },
    { name: 'Dirt',          category: 'Natural', color: '0x665533', roughness: 0.95, metalness: 0 },

    // --- Special ---
    { name: 'Neon Red',      category: 'Special', color: '0x330000', roughness: 0.5, metalness: 0, emissive: '0xFF2222', emissiveIntensity: 2.0 },
    { name: 'Neon Blue',     category: 'Special', color: '0x000033', roughness: 0.5, metalness: 0, emissive: '0x2288FF', emissiveIntensity: 2.0 },
    { name: 'Neon Green',    category: 'Special', color: '0x003300', roughness: 0.5, metalness: 0, emissive: '0x22FF44', emissiveIntensity: 2.0 },
    { name: 'Lava',          category: 'Special', color: '0x331100', roughness: 0.8, metalness: 0, emissive: '0xFF4400', emissiveIntensity: 3.0 }
  ];

  function getPresets() {
    return PRESETS;
  }

  function getCategories() {
    var cats = [];
    var seen = {};
    for (var i = 0; i < PRESETS.length; i++) {
      if (!seen[PRESETS[i].category]) {
        cats.push(PRESETS[i].category);
        seen[PRESETS[i].category] = true;
      }
    }
    return cats;
  }

  function getByCategory(cat) {
    if (!cat) return PRESETS;
    var result = [];
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].category === cat) result.push(PRESETS[i]);
    }
    return result;
  }

  // Apply a preset to face data object — copies relevant PBR fields, clears others
  function applyPreset(preset, faceData) {
    // Clear existing texture/PBR fields
    var clearKeys = ['color', 'roughness', 'metalness', 'emissive', 'emissiveIntensity', 'opacity', 'map', 'normalMap', 'roughnessMap', 'uvScaleX', 'uvScaleY', 'uvOffsetX', 'uvOffsetY'];
    for (var i = 0; i < clearKeys.length; i++) {
      delete faceData[clearKeys[i]];
    }
    // Apply preset values
    if (preset.color !== undefined) faceData.color = preset.color;
    if (preset.roughness !== undefined) faceData.roughness = preset.roughness;
    if (preset.metalness !== undefined) faceData.metalness = preset.metalness;
    if (preset.emissive !== undefined) faceData.emissive = preset.emissive;
    if (preset.emissiveIntensity !== undefined) faceData.emissiveIntensity = preset.emissiveIntensity;
    if (preset.opacity !== undefined) faceData.opacity = preset.opacity;
    if (preset.map !== undefined) faceData.map = preset.map;
    if (preset.normalMap !== undefined) faceData.normalMap = preset.normalMap;
    if (preset.roughnessMap !== undefined) faceData.roughnessMap = preset.roughnessMap;
    if (preset.uvScaleX !== undefined) faceData.uvScaleX = preset.uvScaleX;
    if (preset.uvScaleY !== undefined) faceData.uvScaleY = preset.uvScaleY;
  }

  // Parse color string to CSS hex for swatch display
  function colorToCSS(colorStr) {
    if (!colorStr) return '#AAAAAA';
    return '#' + String(colorStr).replace(/^0x/, '');
  }

  return {
    getPresets: getPresets,
    getCategories: getCategories,
    getByCategory: getByCategory,
    applyPreset: applyPreset,
    colorToCSS: colorToCSS
  };
})();
