// ============================================================
// EDITOR-PROJECT — Multi-scene project manager + scene templates
// ============================================================

var EditorProject = (function() {
  'use strict';

  var STORAGE_KEY = 'xj_project';
  var project = null;  // { title, activeScene, scenes: { name: sceneData } }
  var modalEl = null;
  var onSwitchCallback = null;

  // --- Templates (v2 flat objects format) ---
  var TEMPLATES = {
    blank: {
      label: 'Blank',
      desc: 'Baseplate with spawn pad, sky, and default lighting.',
      icon: '\u25A1',
      build: function() {
        var cx = 50, cz = 50;
        return {
          formatVersion: 2,
          title: 'Untitled',
          world: { width: 100, depth: 100, sky: 'clearDay' },
          spawn: { x: cx, z: cz, rot: 0 },
          player: { eyeHeight: 1.6, walkSpeed: 4.0, sprintSpeed: 8.0, radius: 0.3, gravity: 15, jumpSpeed: 6 },
          colors: { fog: '0x9AB0C0' },
          objects: [
            // Baseplate
            { id: 'box_0', primitive: 'box', tag: 'Baseplate', x: cx, y: -0.1, z: cz, w: 100, h: 0.2, d: 100, rot: 0,
              faces: { all: { color: '0x7B8C7B', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Spawn pad
            { id: 'box_1', primitive: 'box', tag: 'SpawnPad', x: cx, y: 0.1, z: cz, w: 4, h: 0.2, d: 4, rot: 0,
              faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Spawn point (on top of pad)
            { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: cx, y: 0.2, z: cz, rot: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
            // Lights
            { id: 'emp_1', primitive: 'empty', tag: 'Ambient Light', x: 0, y: 10, z: 0, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0xFFFFFF', intensity: 0.4 }], scripts: [] },
            { id: 'emp_2', primitive: 'empty', tag: 'Sun', x: 30, y: 20, z: 30, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'directional', color: '0xFFEEDD', intensity: 1.0, castShadow: true }], scripts: [] }
          ],
          prefabs: {},
          groups: []
        };
      }
    },

    indoor: {
      label: 'Indoor Room',
      desc: 'Enclosed room with walls, floor, ceiling, and interior lighting.',
      icon: '\u2302',
      build: function() {
        return {
          formatVersion: 2,
          title: 'Indoor Scene',
          world: { width: 40, depth: 40, sky: 'overcast' },
          spawn: { x: 20, z: 20, rot: 0 },
          player: { eyeHeight: 1.6, walkSpeed: 4.0, sprintSpeed: 8.0, radius: 0.3, gravity: 15, jumpSpeed: 6 },
          colors: { fog: '0x222222' },
          objects: [
            // Spawn pad + spawn
            { id: 'box_sp', primitive: 'box', tag: 'SpawnPad', x: 20, y: 0.05, z: 20, w: 3, h: 0.1, d: 3, rot: 0,
              faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: 20, y: 0.1, z: 20, rot: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
            // Lights
            { id: 'emp_1', primitive: 'empty', tag: 'Ambient', x: 0, y: 0, z: 0, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0xFFFFFF', intensity: 0.2 }], scripts: [] },
            { id: 'emp_2', primitive: 'empty', tag: 'Ceiling Light', x: 20, y: 2.8, z: 20, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xFFEECC', intensity: 1.0, distance: 15, castShadow: true }], scripts: [] },
            { id: 'emp_3', primitive: 'empty', tag: 'Wall Light 1', x: 15, y: 2.8, z: 15, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xCCDDFF', intensity: 0.6, distance: 10 }], scripts: [] },
            { id: 'emp_4', primitive: 'empty', tag: 'Wall Light 2', x: 25, y: 2.8, z: 25, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xCCDDFF', intensity: 0.6, distance: 10 }], scripts: [] },
            // Floor
            { id: 'box_0', primitive: 'box', tag: 'Floor', x: 20, y: -0.05, z: 20, w: 12, h: 0.1, d: 12, rot: 0,
              faces: { all: { color: '0x887766', roughness: 0.85 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Ceiling
            { id: 'box_1', primitive: 'box', tag: 'Ceiling', x: 20, y: 3.1, z: 20, w: 12, h: 0.1, d: 12, rot: 0,
              faces: { all: { color: '0xCCCCCC', roughness: 0.6 } }, behaviors: [], scripts: [] },
            // Walls
            { id: 'box_2', primitive: 'box', tag: 'Wall North', x: 20, y: 1.5, z: 14, w: 12, h: 3, d: 0.2, rot: 0,
              faces: { all: { color: '0xBBBBAA', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_3', primitive: 'box', tag: 'Wall South', x: 20, y: 1.5, z: 26, w: 12, h: 3, d: 0.2, rot: 0,
              faces: { all: { color: '0xBBBBAA', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_4', primitive: 'box', tag: 'Wall East', x: 26, y: 1.5, z: 20, w: 0.2, h: 3, d: 12, rot: 0,
              faces: { all: { color: '0xAAAA99', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_5', primitive: 'box', tag: 'Wall West', x: 14, y: 1.5, z: 20, w: 0.2, h: 3, d: 12, rot: 0,
              faces: { all: { color: '0xAAAA99', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] }
          ],
          prefabs: {},
          groups: []
        };
      }
    },

    outdoor: {
      label: 'Outdoor',
      desc: 'Open landscape with sunlight, trees, rocks, and scattered features.',
      icon: '\u2600',
      build: function() {
        return {
          formatVersion: 2,
          title: 'Outdoor Scene',
          world: { width: 200, depth: 200, sky: 'clearDay' },
          spawn: { x: 100, z: 100, rot: 0 },
          player: { eyeHeight: 1.6, walkSpeed: 5.0, sprintSpeed: 10.0, radius: 0.3, gravity: 15, jumpSpeed: 6 },
          colors: { fog: '0x88AACC' },
          objects: [
            // Baseplate
            { id: 'box_bp', primitive: 'box', tag: 'Baseplate', x: 100, y: -0.1, z: 100, w: 200, h: 0.2, d: 200, rot: 0,
              faces: { all: { color: '0x5A7A4A', roughness: 0.95 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Spawn pad
            { id: 'box_sp', primitive: 'box', tag: 'SpawnPad', x: 100, y: 0.1, z: 100, w: 4, h: 0.2, d: 4, rot: 0,
              faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Spawn + lights
            { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: 100, y: 0.2, z: 100, rot: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
            { id: 'emp_1', primitive: 'empty', tag: 'Ambient', x: 0, y: 0, z: 0, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0x8899BB', intensity: 0.5 }], scripts: [] },
            { id: 'emp_2', primitive: 'empty', tag: 'Sun', x: 60, y: 40, z: 80, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'directional', color: '0xFFEEDD', intensity: 1.2, castShadow: true }], scripts: [] },
            // Rocks
            { id: 'box_0', primitive: 'box', tag: 'Rock 1', x: 90, y: 1.5, z: 90, w: 3, h: 3, d: 3, rot: 0,
              faces: { all: { color: '0xAA8866', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_1', primitive: 'box', tag: 'Rock 2', x: 110, y: 1, z: 95, w: 2, h: 2, d: 2, rot: 0,
              faces: { all: { color: '0x998877', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_2', primitive: 'box', tag: 'Rock 3', x: 105, y: 0.75, z: 110, w: 1.5, h: 1.5, d: 1.5, rot: 0,
              faces: { all: { color: '0x887766', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Trees (trunk + canopy pairs)
            { id: 'cyl_0', primitive: 'cylinder', tag: 'Tree Trunk 1', x: 85, y: 2, z: 85, radiusTop: 0.15, radiusBottom: 0.2, height: 4, rot: 0,
              faces: { all: { color: '0x665533', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'sph_0', primitive: 'sphere', tag: 'Tree Canopy 1', x: 85, y: 5, z: 85, radius: 2, rot: 0,
              faces: { all: { color: '0x338833', roughness: 0.85 } }, behaviors: [], scripts: [] },
            { id: 'cyl_1', primitive: 'cylinder', tag: 'Tree Trunk 2', x: 115, y: 2, z: 88, radiusTop: 0.15, radiusBottom: 0.2, height: 4, rot: 0,
              faces: { all: { color: '0x665533', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'sph_1', primitive: 'sphere', tag: 'Tree Canopy 2', x: 115, y: 5, z: 88, radius: 2.2, rot: 0,
              faces: { all: { color: '0x2D7D2D', roughness: 0.85 } }, behaviors: [], scripts: [] },
            { id: 'cyl_2', primitive: 'cylinder', tag: 'Tree Trunk 3', x: 95, y: 2, z: 115, radiusTop: 0.15, radiusBottom: 0.2, height: 4, rot: 0,
              faces: { all: { color: '0x665533', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'sph_2', primitive: 'sphere', tag: 'Tree Canopy 3', x: 95, y: 4.8, z: 115, radius: 1.8, rot: 0,
              faces: { all: { color: '0x3A8A3A', roughness: 0.85 } }, behaviors: [], scripts: [] }
          ],
          prefabs: {},
          groups: []
        };
      }
    },

    dungeon: {
      label: 'Dungeon',
      desc: 'Dark corridors with dim point lights and tight spaces.',
      icon: '\u2620',
      build: function() {
        return {
          formatVersion: 2,
          title: 'Dungeon',
          world: { width: 60, depth: 60, sky: 'night' },
          spawn: { x: 30, z: 10, rot: 0 },
          player: { eyeHeight: 1.6, walkSpeed: 3.5, sprintSpeed: 6.0, radius: 0.3, gravity: 15, jumpSpeed: 5 },
          colors: { fog: '0x111111' },
          objects: [
            // Spawn pad + spawn
            { id: 'box_sp', primitive: 'box', tag: 'SpawnPad', x: 30, y: 0.05, z: 10, w: 3, h: 0.1, d: 3, rot: 0,
              faces: { all: { color: '0x4A9B9B', roughness: 0.6 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'emp_0', primitive: 'empty', tag: 'Spawn', x: 30, y: 0.1, z: 10, rot: 0, faces: {}, behaviors: [{ type: 'spawn' }], scripts: [] },
            // Ambient
            { id: 'emp_1', primitive: 'empty', tag: 'Ambient', x: 0, y: 0, z: 0, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'ambient', color: '0x222233', intensity: 0.15 }], scripts: [] },
            // Corridor torches
            { id: 'emp_2', primitive: 'empty', tag: 'Torch 1', x: 30, y: 2.2, z: 12, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xFF8833', intensity: 0.8, distance: 8 }], scripts: [] },
            { id: 'emp_3', primitive: 'empty', tag: 'Torch 2', x: 30, y: 2.2, z: 22, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xFF8833', intensity: 0.8, distance: 8 }], scripts: [] },
            { id: 'emp_4', primitive: 'empty', tag: 'Torch 3', x: 30, y: 2.2, z: 32, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xFF8833', intensity: 0.8, distance: 8 }], scripts: [] },
            // Room light
            { id: 'emp_5', primitive: 'empty', tag: 'Room Light', x: 20, y: 2.5, z: 42, rot: 0, faces: {}, behaviors: [{ type: 'light', lightType: 'point', color: '0xFFAA44', intensity: 1.0, distance: 12, castShadow: true }], scripts: [] },
            // Corridor floor
            { id: 'box_0', primitive: 'box', tag: 'Corridor Floor', x: 30, y: -0.05, z: 25, w: 6, h: 0.1, d: 30, rot: 0,
              faces: { all: { color: '0x444433', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Corridor ceiling
            { id: 'box_1', primitive: 'box', tag: 'Corridor Ceiling', x: 30, y: 3.05, z: 25, w: 6, h: 0.1, d: 30, rot: 0,
              faces: { all: { color: '0x333322', roughness: 0.8 } }, behaviors: [], scripts: [] },
            // Corridor walls
            { id: 'box_2', primitive: 'box', tag: 'Left Wall', x: 27, y: 1.5, z: 25, w: 0.2, h: 3, d: 30, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_3', primitive: 'box', tag: 'Right Wall', x: 33, y: 1.5, z: 25, w: 0.2, h: 3, d: 30, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // End wall
            { id: 'box_4', primitive: 'box', tag: 'End Wall', x: 30, y: 1.5, z: 10, w: 6, h: 3, d: 0.2, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Room floor + ceiling
            { id: 'box_5', primitive: 'box', tag: 'Room Floor', x: 22, y: -0.05, z: 42, w: 16, h: 0.1, d: 10, rot: 0,
              faces: { all: { color: '0x554433', roughness: 0.9 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_6', primitive: 'box', tag: 'Room Ceiling', x: 22, y: 3.55, z: 42, w: 16, h: 0.1, d: 10, rot: 0,
              faces: { all: { color: '0x333322', roughness: 0.8 } }, behaviors: [], scripts: [] },
            // Room walls
            { id: 'box_7', primitive: 'box', tag: 'Room North', x: 22, y: 1.75, z: 47, w: 16, h: 3.5, d: 0.2, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_8', primitive: 'box', tag: 'Room West', x: 14, y: 1.75, z: 42, w: 0.2, h: 3.5, d: 10, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_9', primitive: 'box', tag: 'Room East', x: 30, y: 1.75, z: 42, w: 0.2, h: 3.5, d: 10, rot: 0,
              faces: { all: { color: '0x555544', roughness: 0.8 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            // Pillars
            { id: 'box_10', primitive: 'box', tag: 'Pillar', x: 20, y: 1.75, z: 42, w: 0.8, h: 3.5, d: 0.8, rot: 0,
              faces: { all: { color: '0x666655', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] },
            { id: 'box_11', primitive: 'box', tag: 'Pillar 2', x: 24, y: 1.75, z: 42, w: 0.8, h: 3.5, d: 0.8, rot: 0,
              faces: { all: { color: '0x666655', roughness: 0.7 } }, behaviors: [{ type: 'collision' }], scripts: [] }
          ],
          prefabs: {},
          groups: []
        };
      }
    }
  };

  function init() {
    loadProject();
    buildModal();
  }

  // --- Storage ---
  function loadProject() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        project = JSON.parse(raw);
      }
    } catch(e) {}
    if (!project) {
      project = { title: 'My Project', activeScene: '', scenes: {} };
    }
  }

  function saveProject() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch(e) {
      console.warn('[Project] Failed to save project:', e.message);
    }
  }

  // --- Scene CRUD ---
  function getSceneNames() {
    var names = [];
    for (var name in project.scenes) names.push(name);
    names.sort();
    return names;
  }

  function getActiveScene() {
    return project.activeScene || '';
  }

  function saveCurrentScene(name, sceneData) {
    if (!name) return;
    project.scenes[name] = JSON.parse(JSON.stringify(sceneData));
    project.activeScene = name;
    saveProject();
    console.log('[Project] Saved scene: ' + name);
  }

  function loadScene(name) {
    if (!project.scenes[name]) return null;
    project.activeScene = name;
    saveProject();
    return JSON.parse(JSON.stringify(project.scenes[name]));
  }

  function deleteScene(name) {
    delete project.scenes[name];
    if (project.activeScene === name) project.activeScene = '';
    saveProject();
  }

  function renameScene(oldName, newName) {
    if (!project.scenes[oldName] || project.scenes[newName]) return false;
    project.scenes[newName] = project.scenes[oldName];
    delete project.scenes[oldName];
    if (project.activeScene === oldName) project.activeScene = newName;
    saveProject();
    return true;
  }

  function duplicateScene(name) {
    if (!project.scenes[name]) return null;
    var copy = JSON.parse(JSON.stringify(project.scenes[name]));
    var newName = name + ' (Copy)';
    var i = 2;
    while (project.scenes[newName]) {
      newName = name + ' (Copy ' + i + ')';
      i++;
    }
    project.scenes[newName] = copy;
    saveProject();
    return newName;
  }

  function getProjectTitle() {
    return project.title || 'My Project';
  }

  function setProjectTitle(title) {
    project.title = title;
    saveProject();
  }

  // --- Template access ---
  function getTemplateNames() {
    var names = [];
    for (var k in TEMPLATES) names.push(k);
    return names;
  }

  function getTemplate(name) {
    return TEMPLATES[name] || null;
  }

  function buildFromTemplate(templateName) {
    var t = TEMPLATES[templateName];
    if (!t) return null;
    var data = t.build();
    if (!data.objects) data.objects = [];
    if (!data.prefabs) data.prefabs = {};
    if (!data.groups) data.groups = [];
    return data;
  }

  // --- Modal UI ---
  function buildModal() {
    modalEl = document.createElement('div');
    modalEl.id = 'project-modal';
    modalEl.className = 'pm-overlay';
    modalEl.style.display = 'none';
    modalEl.innerHTML =
      '<div class="pm-dialog">' +
        '<div class="pm-header">' +
          '<span class="pm-title">Scene Manager</span>' +
          '<button class="pm-close">&times;</button>' +
        '</div>' +
        '<div class="pm-body">' +
          '<div class="pm-project-row">' +
            '<label>Project:</label>' +
            '<input type="text" class="pm-project-title" value="">' +
          '</div>' +
          '<div class="pm-scene-list"></div>' +
          '<div class="pm-actions">' +
            '<button class="pm-btn pm-btn-new">New Scene</button>' +
            '<button class="pm-btn pm-btn-save">Save Current</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    // Close button
    modalEl.querySelector('.pm-close').addEventListener('click', function() {
      hideModal();
    });

    // Click outside to close
    modalEl.addEventListener('click', function(e) {
      if (e.target === modalEl) hideModal();
    });

    // Project title
    var titleInput = modalEl.querySelector('.pm-project-title');
    titleInput.addEventListener('change', function() {
      setProjectTitle(this.value);
    });

    // New Scene button
    modalEl.querySelector('.pm-btn-new').addEventListener('click', function() {
      hideModal();
      showNewSceneDialog();
    });

    // Save Current button
    modalEl.querySelector('.pm-btn-save').addEventListener('click', function() {
      var name = prompt('Scene name:', project.activeScene || 'Scene 1');
      if (!name) return;
      if (onSwitchCallback) {
        var data = EditorIO.collectSceneData();
        saveCurrentScene(name, data);
        refreshSceneList();
      }
    });
  }

  function showModal() {
    if (!modalEl) return;
    modalEl.querySelector('.pm-project-title').value = getProjectTitle();
    refreshSceneList();
    modalEl.style.display = 'flex';
  }

  function hideModal() {
    if (modalEl) modalEl.style.display = 'none';
  }

  function refreshSceneList() {
    var listEl = modalEl.querySelector('.pm-scene-list');
    listEl.innerHTML = '';

    var names = getSceneNames();
    if (names.length === 0) {
      listEl.innerHTML = '<div class="pm-empty">No saved scenes. Use "Save Current" to save.</div>';
      return;
    }

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var row = document.createElement('div');
      row.className = 'pm-scene-row' + (name === project.activeScene ? ' active' : '');

      var label = document.createElement('span');
      label.className = 'pm-scene-name';
      label.textContent = name;
      row.appendChild(label);

      var btns = document.createElement('span');
      btns.className = 'pm-scene-btns';

      // Load
      var loadBtn = document.createElement('button');
      loadBtn.className = 'pm-btn-sm';
      loadBtn.textContent = 'Load';
      loadBtn.title = 'Switch to this scene';
      (function(n) {
        loadBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (project.activeScene && onSwitchCallback) {
            var currentData = EditorIO.collectSceneData();
            saveCurrentScene(project.activeScene, currentData);
          }
          var data = loadScene(n);
          if (data && onSwitchCallback) {
            onSwitchCallback(data, n);
          }
          hideModal();
        });
      })(name);
      btns.appendChild(loadBtn);

      // Rename
      var renameBtn = document.createElement('button');
      renameBtn.className = 'pm-btn-sm';
      renameBtn.textContent = 'Ren';
      renameBtn.title = 'Rename scene';
      (function(n) {
        renameBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var newName = prompt('New name:', n);
          if (newName && newName !== n) {
            if (renameScene(n, newName)) {
              refreshSceneList();
            } else {
              alert('Name already exists.');
            }
          }
        });
      })(name);
      btns.appendChild(renameBtn);

      // Duplicate
      var dupBtn = document.createElement('button');
      dupBtn.className = 'pm-btn-sm';
      dupBtn.textContent = 'Dup';
      dupBtn.title = 'Duplicate scene';
      (function(n) {
        dupBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          duplicateScene(n);
          refreshSceneList();
        });
      })(name);
      btns.appendChild(dupBtn);

      // Delete
      var delBtn = document.createElement('button');
      delBtn.className = 'pm-btn-sm pm-btn-danger';
      delBtn.textContent = 'Del';
      delBtn.title = 'Delete scene';
      (function(n) {
        delBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (confirm('Delete scene "' + n + '"?')) {
            deleteScene(n);
            refreshSceneList();
          }
        });
      })(name);
      btns.appendChild(delBtn);

      row.appendChild(btns);
      listEl.appendChild(row);
    }
  }

  // --- New Scene with Template Picker ---
  function showNewSceneDialog() {
    var overlay = document.createElement('div');
    overlay.className = 'pm-overlay';
    overlay.style.display = 'flex';

    var dialog = document.createElement('div');
    dialog.className = 'pm-dialog pm-template-dialog';

    var header = document.createElement('div');
    header.className = 'pm-header';
    header.innerHTML = '<span class="pm-title">New Scene</span><button class="pm-close">&times;</button>';
    dialog.appendChild(header);

    header.querySelector('.pm-close').addEventListener('click', function() {
      document.body.removeChild(overlay);
    });

    var body = document.createElement('div');
    body.className = 'pm-body';

    // Scene name input
    var nameRow = document.createElement('div');
    nameRow.className = 'pm-project-row';
    nameRow.innerHTML = '<label>Name:</label>';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'pm-project-title';
    nameInput.value = 'New Scene';
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    // Template grid
    var grid = document.createElement('div');
    grid.className = 'pm-template-grid';

    var tNames = getTemplateNames();
    for (var ti = 0; ti < tNames.length; ti++) {
      var tKey = tNames[ti];
      var tpl = TEMPLATES[tKey];

      var card = document.createElement('div');
      card.className = 'pm-template-card';
      card.setAttribute('data-template', tKey);

      var icon = document.createElement('div');
      icon.className = 'pm-template-icon';
      icon.textContent = tpl.icon;
      card.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'pm-template-info';

      var tLabel = document.createElement('div');
      tLabel.className = 'pm-template-label';
      tLabel.textContent = tpl.label;
      info.appendChild(tLabel);

      var tDesc = document.createElement('div');
      tDesc.className = 'pm-template-desc';
      tDesc.textContent = tpl.desc;
      info.appendChild(tDesc);

      card.appendChild(info);

      (function(key) {
        card.addEventListener('click', function() {
          var cards = grid.querySelectorAll('.pm-template-card');
          for (var ci = 0; ci < cards.length; ci++) cards[ci].classList.remove('selected');
          this.classList.add('selected');
        });
      })(tKey);

      grid.appendChild(card);
    }

    body.appendChild(grid);

    // Create button
    var createBtn = document.createElement('button');
    createBtn.className = 'pm-btn pm-btn-create';
    createBtn.textContent = 'Create Scene';
    createBtn.addEventListener('click', function() {
      var selected = grid.querySelector('.pm-template-card.selected');
      var templateKey = selected ? selected.getAttribute('data-template') : 'blank';
      var sceneName = nameInput.value.trim() || 'Untitled';

      var data = buildFromTemplate(templateKey);
      if (data) {
        data.title = sceneName;
        saveCurrentScene(sceneName, data);
        if (onSwitchCallback) {
          onSwitchCallback(data, sceneName);
        }
      }
      document.body.removeChild(overlay);
    });
    body.appendChild(createBtn);

    dialog.appendChild(body);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    document.body.appendChild(overlay);

    // Auto-select first template
    var firstCard = grid.querySelector('.pm-template-card');
    if (firstCard) firstCard.classList.add('selected');
  }

  function onSwitch(fn) {
    onSwitchCallback = fn;
  }

  return {
    init: init,
    showModal: showModal,
    hideModal: hideModal,
    showNewSceneDialog: showNewSceneDialog,
    getSceneNames: getSceneNames,
    getActiveScene: getActiveScene,
    saveCurrentScene: saveCurrentScene,
    loadScene: loadScene,
    deleteScene: deleteScene,
    renameScene: renameScene,
    duplicateScene: duplicateScene,
    getProjectTitle: getProjectTitle,
    setProjectTitle: setProjectTitle,
    buildFromTemplate: buildFromTemplate,
    getTemplateNames: getTemplateNames,
    getTemplate: getTemplate,
    onSwitch: onSwitch
  };
})();
