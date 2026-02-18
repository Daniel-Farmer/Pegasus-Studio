#!/usr/bin/env node
// ============================================================
// build-catalog.js — Scan models/*/ and generate models/catalog.json
// ============================================================

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');

// Map directory names to categories
const PACK_MAP = {
  'kenney-city-kit-suburban': { pack: 'City Kit (Suburban)', category: 'Buildings' },
  'kenney-nature-kit':        { pack: 'Nature Kit',          category: 'Nature' },
  'kenney-furniture-kit':     { pack: 'Furniture Kit',       category: 'Furniture' },
  'kenney-car-kit':           { pack: 'Car Kit',             category: 'Vehicles' },
  'kenney-fantasy-town-kit':  { pack: 'Fantasy Town Kit',    category: 'Medieval' },
  'kenney-pirate-kit':        { pack: 'Pirate Kit',          category: 'Adventure' },
};

// Convert filename to readable name: "house-type-A.glb" → "House Type A"
function fileToName(filename) {
  var base = filename.replace(/\.(glb|gltf)$/i, '');
  return base
    .split(/[-_]/)
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function buildCatalog() {
  var models = [];

  // Scan each subdirectory in models/
  var dirs;
  try {
    dirs = fs.readdirSync(MODELS_DIR);
  } catch (e) {
    console.error('Cannot read models directory:', MODELS_DIR);
    process.exit(1);
  }

  for (var i = 0; i < dirs.length; i++) {
    var dirName = dirs[i];
    var dirPath = path.join(MODELS_DIR, dirName);

    // Skip files, only process directories
    if (!fs.statSync(dirPath).isDirectory()) continue;
    // Skip uploads directory
    if (dirName === 'uploads') continue;

    var packInfo = PACK_MAP[dirName] || { pack: dirName, category: 'Other' };

    var files;
    try {
      files = fs.readdirSync(dirPath);
    } catch (e) {
      continue;
    }

    for (var j = 0; j < files.length; j++) {
      var file = files[j];
      var ext = path.extname(file).toLowerCase();
      if (ext !== '.glb' && ext !== '.gltf') continue;

      var id = dirName + '/' + file.replace(/\.(glb|gltf)$/i, '');
      var name = fileToName(file);
      var filePath = 'models/' + dirName + '/' + file;

      models.push({
        id: id,
        name: name,
        category: packInfo.category,
        pack: packInfo.pack,
        file: filePath,
        thumbnail: ''
      });
    }
  }

  // Sort by category then name
  models.sort(function(a, b) {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });

  var catalog = { models: models };
  var outPath = path.join(MODELS_DIR, 'catalog.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log('Generated', outPath, '—', models.length, 'models');
}

buildCatalog();
