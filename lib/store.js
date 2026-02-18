// ============================================================
// STORE — JSON file storage helper (data/ directory)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function dataPath(...parts) {
  return path.join(DATA_DIR, ...parts);
}

function ensureDir(dir) {
  const full = path.join(DATA_DIR, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
}

function readJSON(file) {
  const p = path.join(DATA_DIR, file);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(file, data) {
  const p = path.join(DATA_DIR, file);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

module.exports = { dataPath, ensureDir, readJSON, writeJSON };
