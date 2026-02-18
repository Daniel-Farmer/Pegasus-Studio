// ============================================================
// PROJECTS — Project CRUD (per-user project directories)
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

function defaultSceneData() {
  var cx = 50, cz = 50;
  return {
    formatVersion: 2,
    title: 'Untitled',
    world: { width: 100, depth: 100, sky: 'sunset' },
    spawn: { x: cx, z: cz, rot: 0 },
    player: { eyeHeight: 1.6, walkSpeed: 4.0, sprintSpeed: 8.0, radius: 0.3, gravity: 15, jumpSpeed: 6 },
    colors: { fog: '0x9AB0C0' },
    objects: [
      { id: 'box_0', primitive: 'box', tag: 'Baseplate', x: cx, y: -0.1, z: cz, w: 100, h: 0.2, d: 100, rot: 0,
        faces: { all: { color: '0x7B8C7B', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
      { id: 'box_1', primitive: 'box', tag: 'SpawnPad', x: cx, y: 0.1, z: cz, w: 4, h: 0.2, d: 4, rot: 0,
        faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
      { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: cx, y: 0.2, z: cz, rot: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
      { id: 'emp_1', primitive: 'empty', tag: 'Ambient Light', x: 0, y: 10, z: 0, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0xFFFFFF', intensity: 0.4 }], scripts: [] },
      { id: 'emp_2', primitive: 'empty', tag: 'Sun', x: 30, y: 20, z: 30, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'directional', color: '0xFFEEDD', intensity: 1.0, castShadow: true }], scripts: [] }
    ],
    prefabs: {},
    groups: [],
    folders: []
  };
}

function listByOwner(userId) {
  const projectsDir = store.dataPath('projects');
  if (!fs.existsSync(projectsDir)) return [];

  const dirs = fs.readdirSync(projectsDir);
  const results = [];
  for (const uid of dirs) {
    const metaPath = path.join(projectsDir, uid, 'project.json');
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const meta = JSON.parse(raw);
      if (meta.ownerId === userId) {
        results.push(meta);
      }
    } catch (e) {
      // skip broken entries
    }
  }
  results.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  return results;
}

function create(userId, title) {
  const uid = crypto.randomUUID();
  const now = new Date().toISOString();

  store.ensureDir('projects/' + uid);

  const meta = { uid, ownerId: userId, title: title || 'Untitled', createdAt: now, updatedAt: now };
  store.writeJSON('projects/' + uid + '/project.json', meta);
  store.writeJSON('projects/' + uid + '/scene.json', defaultSceneData());

  return meta;
}

function get(uid) {
  return store.readJSON('projects/' + uid + '/project.json');
}

function getScene(uid) {
  return store.readJSON('projects/' + uid + '/scene.json');
}

const MAX_BACKUPS = 5;

function saveScene(uid, data) {
  // Create backup of current scene before overwriting
  const currentScene = store.readJSON('projects/' + uid + '/scene.json');
  if (currentScene) {
    const backups = store.readJSON('projects/' + uid + '/backups.json') || [];
    backups.unshift({
      timestamp: new Date().toISOString(),
      scene: currentScene
    });
    // Keep only MAX_BACKUPS
    while (backups.length > MAX_BACKUPS) backups.pop();
    store.writeJSON('projects/' + uid + '/backups.json', backups);
  }

  store.writeJSON('projects/' + uid + '/scene.json', data);
  // Update timestamp
  const meta = store.readJSON('projects/' + uid + '/project.json');
  if (meta) {
    meta.updatedAt = new Date().toISOString();
    store.writeJSON('projects/' + uid + '/project.json', meta);
  }
}

function getBackups(uid) {
  return store.readJSON('projects/' + uid + '/backups.json') || [];
}

function revertToBackup(uid, index) {
  const backups = store.readJSON('projects/' + uid + '/backups.json') || [];
  if (index < 0 || index >= backups.length) return null;
  const backup = backups[index];
  // Save current as a new backup before reverting
  saveScene(uid, backup.scene);
  return backup.scene;
}

function remove(uid) {
  const dir = store.dataPath('projects', uid);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { listByOwner, create, get, getScene, saveScene, getBackups, revertToBackup, remove };
