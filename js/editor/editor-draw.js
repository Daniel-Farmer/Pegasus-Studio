// ============================================================
// EDITOR-DRAW — Top-down drawing tools (wall, room, floor, door)
// ============================================================

var EditorDraw = (function() {
  'use strict';

  // Constants
  var WALL_HEIGHT = 3;
  var WALL_THICKNESS = 0.2;
  var WALL_COLOR = '0xCCCCCC';
  var DOOR_WIDTH = 1.2;
  var DOOR_HEIGHT = 2.2;
  var PREVIEW_COLOR = 0x44aaff;
  var PREVIEW_OPACITY = 0.3;
  var MIN_DRAG = 0.3;

  // State
  var activeTool = null; // null | 'wall' | 'room' | 'floor' | 'door'
  var isDrawing = false;
  var startPoint = null;
  var currentPoint = null;
  var previewGroup = null;
  var sceneRef = null;
  var commitCallback = null;

  // Preview material (reused)
  var previewMat = null;

  function init(scene) {
    sceneRef = scene;
    previewGroup = new THREE.Group();
    previewGroup.name = '__drawPreview';
    scene.add(previewGroup);
    previewMat = new THREE.MeshBasicMaterial({
      color: PREVIEW_COLOR,
      transparent: true,
      opacity: PREVIEW_OPACITY,
      depthTest: false
    });
  }

  function setTool(name) {
    if (isDrawing) cancel();
    activeTool = name || null;
  }

  function getTool() { return activeTool; }
  function isActive() { return activeTool !== null; }
  function isCurrentlyDrawing() { return isDrawing; }

  function onCommit(fn) { commitCallback = fn; }

  // --- Mouse handlers ---

  function onMouseDown(worldPos) {
    if (!activeTool) return;

    var snapped = snapPos(worldPos);

    if (activeTool === 'door') {
      handleDoorClick(snapped);
      return;
    }

    // Start drag for wall/room/floor
    isDrawing = true;
    startPoint = snapped;
    currentPoint = snapped.clone();
  }

  function onMouseMove(worldPos) {
    if (!isDrawing || !startPoint) return;
    currentPoint = snapPos(worldPos);
    updatePreview();
  }

  function onMouseUp(worldPos) {
    if (!isDrawing || !startPoint) return;
    currentPoint = snapPos(worldPos);

    var dx = currentPoint.x - startPoint.x;
    var dz = currentPoint.z - startPoint.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < MIN_DRAG) {
      // Too short — cancel
      cancel();
      return;
    }

    // Commit based on tool
    var ids = [];
    if (activeTool === 'wall') {
      ids = commitWall(startPoint, currentPoint);
    } else if (activeTool === 'room') {
      ids = commitRoom(startPoint, currentPoint);
    } else if (activeTool === 'floor') {
      ids = commitFloor(startPoint, currentPoint);
    }

    clearPreview();
    isDrawing = false;
    startPoint = null;
    currentPoint = null;

    if (commitCallback && ids.length > 0) {
      commitCallback(ids);
    }
  }

  function cancel() {
    clearPreview();
    isDrawing = false;
    startPoint = null;
    currentPoint = null;
  }

  // --- Snap helper ---

  function snapPos(worldPos) {
    var gs = EditorGrid.getSize();
    return new THREE.Vector3(
      Math.round(worldPos.x / gs) * gs,
      0,
      Math.round(worldPos.z / gs) * gs
    );
  }

  // --- Preview rendering ---

  function updatePreview() {
    clearPreview();
    if (!startPoint || !currentPoint) return;

    if (activeTool === 'wall') {
      previewWall(startPoint, currentPoint);
    } else if (activeTool === 'room') {
      previewRoom(startPoint, currentPoint);
    } else if (activeTool === 'floor') {
      previewFloor(startPoint, currentPoint);
    }
  }

  function clearPreview() {
    while (previewGroup.children.length > 0) {
      var child = previewGroup.children[0];
      previewGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
  }

  function addPreviewBox(x, y, z, w, h, d, rotY) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(geo, previewMat);
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.renderOrder = 900;
    previewGroup.add(mesh);
    return mesh;
  }

  function addPreviewPlane(x, y, z, w, d) {
    var geo = new THREE.PlaneGeometry(w, d);
    var mesh = new THREE.Mesh(geo, previewMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 900;
    previewGroup.add(mesh);
    return mesh;
  }

  // --- Wall preview ---

  function previewWall(a, b) {
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < MIN_DRAG) return;
    var midX = (a.x + b.x) / 2;
    var midZ = (a.z + b.z) / 2;
    var angle = Math.atan2(-dz, dx);
    addPreviewBox(midX, WALL_HEIGHT / 2, midZ, len, WALL_HEIGHT, WALL_THICKNESS, angle);
  }

  // --- Room preview (4 walls + floor) ---

  function previewRoom(a, b) {
    var minX = Math.min(a.x, b.x);
    var maxX = Math.max(a.x, b.x);
    var minZ = Math.min(a.z, b.z);
    var maxZ = Math.max(a.z, b.z);
    var w = maxX - minX;
    var d = maxZ - minZ;
    if (w < MIN_DRAG && d < MIN_DRAG) return;

    var half = WALL_THICKNESS / 2;

    // North wall (minZ edge)
    if (w > 0) addPreviewBox(minX + w / 2, WALL_HEIGHT / 2, minZ, w + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS, 0);
    // South wall (maxZ edge)
    if (w > 0) addPreviewBox(minX + w / 2, WALL_HEIGHT / 2, maxZ, w + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS, 0);
    // West wall (minX edge)
    if (d > 0) addPreviewBox(minX, WALL_HEIGHT / 2, minZ + d / 2, d - WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS, Math.PI / 2);
    // East wall (maxX edge)
    if (d > 0) addPreviewBox(maxX, WALL_HEIGHT / 2, minZ + d / 2, d - WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS, Math.PI / 2);
    // Floor
    addPreviewPlane(minX + w / 2, 0.02, minZ + d / 2, w, d);
  }

  // --- Floor preview ---

  function previewFloor(a, b) {
    var minX = Math.min(a.x, b.x);
    var maxX = Math.max(a.x, b.x);
    var minZ = Math.min(a.z, b.z);
    var maxZ = Math.max(a.z, b.z);
    var w = maxX - minX;
    var d = maxZ - minZ;
    if (w < MIN_DRAG && d < MIN_DRAG) return;
    addPreviewPlane(minX + w / 2, 0.02, minZ + d / 2, w, d);
  }

  // --- Commit: Wall ---

  function commitWall(a, b) {
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    var midX = (a.x + b.x) / 2;
    var midZ = (a.z + b.z) / 2;
    var angle = Math.atan2(-dz, dx);

    var id = Engine.addObject('box', {
      tag: 'Wall',
      x: midX, y: WALL_HEIGHT / 2, z: midZ,
      w: len, h: WALL_HEIGHT, d: WALL_THICKNESS,
      rotX: 0, rotY: angle, rotZ: 0,
      faces: { all: { color: WALL_COLOR, roughness: 0.8 } },
      behaviors: [{ type: 'collision' }]
    });
    return id ? [id] : [];
  }

  // --- Commit: Room (4 walls + floor) ---

  function commitRoom(a, b) {
    var minX = Math.min(a.x, b.x);
    var maxX = Math.max(a.x, b.x);
    var minZ = Math.min(a.z, b.z);
    var maxZ = Math.max(a.z, b.z);
    var w = maxX - minX;
    var d = maxZ - minZ;
    var ids = [];

    // North wall
    if (w > 0) {
      var id = Engine.addObject('box', {
        tag: 'Wall', x: minX + w / 2, y: WALL_HEIGHT / 2, z: minZ,
        w: w + WALL_THICKNESS, h: WALL_HEIGHT, d: WALL_THICKNESS,
        rotX: 0, rotY: 0, rotZ: 0,
        faces: { all: { color: WALL_COLOR, roughness: 0.8 } },
        behaviors: [{ type: 'collision' }]
      });
      if (id) ids.push(id);
    }

    // South wall
    if (w > 0) {
      var id = Engine.addObject('box', {
        tag: 'Wall', x: minX + w / 2, y: WALL_HEIGHT / 2, z: maxZ,
        w: w + WALL_THICKNESS, h: WALL_HEIGHT, d: WALL_THICKNESS,
        rotX: 0, rotY: 0, rotZ: 0,
        faces: { all: { color: WALL_COLOR, roughness: 0.8 } },
        behaviors: [{ type: 'collision' }]
      });
      if (id) ids.push(id);
    }

    // West wall
    if (d > 0) {
      var id = Engine.addObject('box', {
        tag: 'Wall', x: minX, y: WALL_HEIGHT / 2, z: minZ + d / 2,
        w: d - WALL_THICKNESS, h: WALL_HEIGHT, d: WALL_THICKNESS,
        rotX: 0, rotY: Math.PI / 2, rotZ: 0,
        faces: { all: { color: WALL_COLOR, roughness: 0.8 } },
        behaviors: [{ type: 'collision' }]
      });
      if (id) ids.push(id);
    }

    // East wall
    if (d > 0) {
      var id = Engine.addObject('box', {
        tag: 'Wall', x: maxX, y: WALL_HEIGHT / 2, z: minZ + d / 2,
        w: d - WALL_THICKNESS, h: WALL_HEIGHT, d: WALL_THICKNESS,
        rotX: 0, rotY: Math.PI / 2, rotZ: 0,
        faces: { all: { color: WALL_COLOR, roughness: 0.8 } },
        behaviors: [{ type: 'collision' }]
      });
      if (id) ids.push(id);
    }

    // Floor plane
    var floorId = Engine.addObject('plane', {
      tag: 'Floor', x: minX + w / 2, y: 0.01, z: minZ + d / 2,
      w: w, h: d,
      rotX: 0, rotY: 0, rotZ: 0,
      facing: 'up',
      faces: { all: { color: '0x888888', roughness: 0.9 } },
      behaviors: []
    });
    if (floorId) ids.push(floorId);

    return ids;
  }

  // --- Commit: Floor ---

  function commitFloor(a, b) {
    var minX = Math.min(a.x, b.x);
    var maxX = Math.max(a.x, b.x);
    var minZ = Math.min(a.z, b.z);
    var maxZ = Math.max(a.z, b.z);
    var w = maxX - minX;
    var d = maxZ - minZ;

    var id = Engine.addObject('plane', {
      tag: 'Floor', x: minX + w / 2, y: 0.01, z: minZ + d / 2,
      w: w, h: d,
      rotX: 0, rotY: 0, rotZ: 0,
      facing: 'up',
      faces: { all: { color: '0x888888', roughness: 0.9 } },
      behaviors: []
    });
    return id ? [id] : [];
  }

  // --- Door tool (click-on-wall) ---

  function handleDoorClick(clickPos) {
    // Find the wall box under the click by raycasting through all engine entries
    var bestEntry = null;
    var bestId = null;
    var bestDist = Infinity;

    var entries = Engine.getAllEntries();
    for (var eid in entries) {
      var entry = entries[eid];
      if (!entry || !entry.data) continue;
      var d = entry.data;
      // Only consider thin boxes (walls): thickness <= 0.5 and height >= DOOR_HEIGHT
      if (d.primitive !== 'box') continue;
      var h = d.h || 1;
      var wallW = d.w || 1;
      var wallD = d.d || 1;
      var thin = Math.min(wallW, wallD);
      var long = Math.max(wallW, wallD);
      if (thin > 0.5 || h < DOOR_HEIGHT || long < DOOR_WIDTH + 0.5) continue;

      // Check if click is near this wall
      var dist = distToWall(clickPos, d);
      if (dist !== null && dist < bestDist) {
        bestDist = dist;
        bestEntry = entry;
        bestId = eid;
      }
    }

    if (!bestEntry || bestDist > 1.0) return;

    splitWallForDoor(bestId, bestEntry.data, clickPos);
  }

  function distToWall(clickPos, d) {
    // Get wall center, dimensions, rotation
    var cx = d.x || 0;
    var cz = d.z || 0;
    var rotY = d.rotY || 0;
    var wallW = d.w || 1;
    var wallD = d.d || 1;
    var len = Math.max(wallW, wallD);
    var thick = Math.min(wallW, wallD);

    // Transform click into wall's local space
    var dx = clickPos.x - cx;
    var dz = clickPos.z - cz;
    var cosR = Math.cos(-rotY);
    var sinR = Math.sin(-rotY);
    var localX = dx * cosR - dz * sinR;
    var localZ = dx * sinR + dz * cosR;

    // Wall extends along local X by len/2, and local Z by thick/2
    // Check if we need to swap axes based on which dim is length
    var halfLen, halfThick;
    if (wallW >= wallD) {
      halfLen = wallW / 2;
      halfThick = wallD / 2;
    } else {
      // Width < depth: wall length is along local Z (but rotated)
      halfLen = wallD / 2;
      halfThick = wallW / 2;
      var tmp = localX;
      localX = localZ;
      localZ = tmp;
    }

    // Check if click is within wall bounds (with margin)
    var margin = 1.0;
    if (Math.abs(localX) > halfLen + margin) return null;
    if (Math.abs(localZ) > halfThick + margin) return null;

    return Math.abs(localZ);
  }

  function splitWallForDoor(wallId, d, clickPos) {
    var cx = d.x || 0;
    var cz = d.z || 0;
    var rotY = d.rotY || 0;
    var wallW = d.w || 1;
    var wallD = d.d || 1;
    var wallH = d.h || WALL_HEIGHT;

    // Determine which axis is length
    var len, thick;
    var lengthIsW = (wallW >= wallD);
    if (lengthIsW) {
      len = wallW;
      thick = wallD;
    } else {
      len = wallD;
      thick = wallW;
    }

    // Project click onto wall's length axis
    var dx = clickPos.x - cx;
    var dz = clickPos.z - cz;
    var cosR = Math.cos(-rotY);
    var sinR = Math.sin(-rotY);
    var localAlong = dx * cosR - dz * sinR;
    if (!lengthIsW) {
      localAlong = dx * sinR + dz * cosR;
    }

    // Clamp door position away from edges
    var halfDoor = DOOR_WIDTH / 2;
    var halfLen = len / 2;
    var minPos = -halfLen + halfDoor + 0.1;
    var maxPos = halfLen - halfDoor - 0.1;
    if (minPos > maxPos) return; // wall too short

    localAlong = Math.max(minPos, Math.min(maxPos, localAlong));

    // Calculate the two remaining wall segments
    var leftLen = (localAlong - halfDoor) + halfLen;
    var rightLen = halfLen - (localAlong + halfDoor);

    // Copy face/behavior data from original
    var faces = d.faces ? JSON.parse(JSON.stringify(d.faces)) : { all: { color: WALL_COLOR, roughness: 0.8 } };
    var behaviors = [{ type: 'collision' }];

    // Remove original wall
    Engine.unregister(wallId);

    var ids = [];

    // Direction vectors along wall
    var sinY = Math.sin(rotY);
    var cosY = Math.cos(rotY);
    var alongX, alongZ;
    if (lengthIsW) {
      alongX = sinY;
      alongZ = cosY;
    } else {
      alongX = cosY;
      alongZ = -sinY;
    }

    // Left segment
    if (leftLen > 0.05) {
      var leftCenter = -halfLen + leftLen / 2;
      var lx = cx + alongX * leftCenter;
      var lz = cz + alongZ * leftCenter;
      var wallData = {
        tag: 'Wall', x: lx, y: d.y, z: lz,
        rotX: 0, rotY: rotY, rotZ: 0,
        faces: JSON.parse(JSON.stringify(faces)),
        behaviors: JSON.parse(JSON.stringify(behaviors))
      };
      if (lengthIsW) { wallData.w = leftLen; wallData.h = wallH; wallData.d = thick; }
      else { wallData.w = thick; wallData.h = wallH; wallData.d = leftLen; }
      var id = Engine.addObject('box', wallData);
      if (id) ids.push(id);
    }

    // Right segment
    if (rightLen > 0.05) {
      var rightCenter = localAlong + halfDoor + rightLen / 2;
      var rightOffset = rightCenter - halfLen;
      // Actually: rightCenter is measured from -halfLen
      // Offset from center = rightCenter - 0 (but we measured from -halfLen)
      var rcFromCenter = -halfLen + (localAlong + halfDoor) + rightLen / 2;
      var rx = cx + alongX * rcFromCenter;
      var rz = cz + alongZ * rcFromCenter;
      var wallData = {
        tag: 'Wall', x: rx, y: d.y, z: rz,
        rotX: 0, rotY: rotY, rotZ: 0,
        faces: JSON.parse(JSON.stringify(faces)),
        behaviors: JSON.parse(JSON.stringify(behaviors))
      };
      if (lengthIsW) { wallData.w = rightLen; wallData.h = wallH; wallData.d = thick; }
      else { wallData.w = thick; wallData.h = wallH; wallData.d = rightLen; }
      var id = Engine.addObject('box', wallData);
      if (id) ids.push(id);
    }

    // Lintel above door (if wall is taller than door)
    if (wallH > DOOR_HEIGHT + 0.05) {
      var lintelH = wallH - DOOR_HEIGHT;
      var lintelY = DOOR_HEIGHT + lintelH / 2;
      var doorCenterX = cx + alongX * localAlong;
      var doorCenterZ = cz + alongZ * localAlong;
      var lintelData = {
        tag: 'Lintel', x: doorCenterX, y: lintelY, z: doorCenterZ,
        rotX: 0, rotY: rotY, rotZ: 0,
        faces: JSON.parse(JSON.stringify(faces)),
        behaviors: [{ type: 'collision' }]
      };
      if (lengthIsW) { lintelData.w = DOOR_WIDTH; lintelData.h = lintelH; lintelData.d = thick; }
      else { lintelData.w = thick; lintelData.h = lintelH; lintelData.d = DOOR_WIDTH; }
      var id = Engine.addObject('box', lintelData);
      if (id) ids.push(id);
    }

    if (commitCallback && ids.length > 0) {
      commitCallback(ids);
    }
  }

  // --- Public API ---

  return {
    init: init,
    setTool: setTool,
    getTool: getTool,
    isActive: isActive,
    isCurrentlyDrawing: isCurrentlyDrawing,
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    cancel: cancel,
    onCommit: onCommit
  };
})();
