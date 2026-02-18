// ============================================================
// COLLISION — Circle-vs-AABB slide collision (primitive-based)
// ============================================================

var Collision = (function() {
  'use strict';

  var boxes = [];
  var terrains = [];

  function clear() { boxes = []; terrains = []; }

  function addBox(minX, minZ, maxX, maxZ, minY, maxY) {
    boxes.push({
      minX: minX, minZ: minZ, maxX: maxX, maxZ: maxZ,
      minY: minY !== undefined ? minY : 0,
      maxY: maxY !== undefined ? maxY : 999
    });
  }

  // Build collision boxes from flat scene objects array
  function buildFromScene(sceneData) {
    clear();

    var objects = sceneData.objects;
    if (!objects) return;

    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      // Only process objects that have a collision behavior
      if (!hasCollisionBehavior(obj)) continue;

      var prim = obj.primitive;

      if (prim === 'box') {
        var bx = obj.x || 0, by = obj.y || 0, bz = obj.z || 0;
        var hw = (obj.w || 1) / 2;
        var hh = (obj.h || 1);
        var hd = (obj.d || 1) / 2;
        addBox(bx - hw, bz - hd, bx + hw, bz + hd, by - (obj.h || 1) / 2, by + (obj.h || 1) / 2);
      } else if (prim === 'cylinder') {
        var cx = obj.x || 0, cy = obj.y || 0, cz = obj.z || 0;
        var ch = obj.height || 1;
        var cr = Math.max(obj.radiusTop || 0.5, obj.radiusBottom || 0.5);
        addBox(cx - cr, cz - cr, cx + cr, cz + cr, cy, cy + ch);
      } else if (prim === 'sphere') {
        var sx = obj.x || 0, sy = obj.y || 0, sz = obj.z || 0;
        var sr = obj.radius || 0.5;
        addBox(sx - sr, sz - sr, sx + sr, sz + sr, sy - sr, sy + sr);
      } else if (prim === 'plane') {
        var pw = (obj.w || 2) / 2;
        var ph = (obj.h || 2) / 2;
        var py = obj.y || 0;
        var px = obj.x || 0;
        var pz = obj.z || 0;
        var facing = obj.facing || 'up';
        if (facing === 'up') {
          addBox(px - pw, pz - ph, px + pw, pz + ph, py, py + 0.05);
        }
        // front/right facing planes are vertical, thin collision
      }
      else if (prim === 'cone') {
        var cx = obj.x || 0, cy = obj.y || 0, cz = obj.z || 0;
        var ch = obj.height || 2;
        var cr = obj.radiusBottom || 0.5;
        addBox(cx - cr, cz - cr, cx + cr, cz + cr, cy, cy + ch);
      } else if (prim === 'wedge') {
        var wx = obj.x || 0, wy = obj.y || 0, wz = obj.z || 0;
        var ww = (obj.w || 2) / 2;
        var wh = obj.h || 2;
        var wd = (obj.d || 2) / 2;
        addBox(wx - ww, wz - wd, wx + ww, wz + wd, wy, wy + wh);
      } else if (prim === 'torus') {
        var tx = obj.x || 0, ty = obj.y || 0, tz = obj.z || 0;
        var tr = (obj.radius || 1) + (obj.tube || 0.3);
        var tt = obj.tube || 0.3;
        addBox(tx - tr, tz - tr, tx + tr, tz + tr, ty - tt, ty + tt);
      } else if (prim === 'stairs') {
        var stx = obj.x || 0, sty = obj.y || 0, stz = obj.z || 0;
        var stw = (obj.w || 2) / 2;
        var sth = obj.h || 2;
        var std = obj.d || 4;
        var sts = obj.steps || 8;
        var stepH = sth / sts;
        var stepD = std / sts;
        for (var si = 0; si < sts; si++) {
          var szStart = stz + si * stepD;
          var szEnd = stz + (si + 1) * stepD;
          addBox(stx - stw, szStart, stx + stw, szEnd, sty, sty + (si + 1) * stepH);
        }
      }
      else if (prim === 'terrain') {
        terrains.push({
          x: obj.x || 0, y: obj.y || 0, z: obj.z || 0,
          width: obj.width || 100, depth: obj.depth || 100,
          segments: obj.segments || 64, heights: obj.heights || []
        });
      }
      // empty: skip (no geometry)
    }

    // World bounds
    var worldW = (sceneData.world && sceneData.world.width) || 100;
    var worldD = (sceneData.world && sceneData.world.depth) || 100;
    var pad = 1;
    addBox(-pad, -pad, worldW, 0, -10, 100);
    addBox(-pad, worldD, worldW, worldD + pad, -10, 100);
    addBox(-pad, -pad, 0, worldD + pad, -10, 100);
    addBox(worldW, -pad, worldW + pad, worldD + pad, -10, 100);
  }

  function hasCollisionBehavior(obj) {
    if (!obj.behaviors) return false;
    for (var i = 0; i < obj.behaviors.length; i++) {
      if (obj.behaviors[i].type === 'collision') return true;
    }
    return false;
  }

  // Legacy compat: build from XJ globals or Engine registry
  function buildFromWorld() {
    if (typeof Engine !== 'undefined' && Engine.getSceneDataRef) {
      var sd = Engine.getSceneDataRef();
      if (sd && sd.objects) {
        buildFromScene(sd);
        return;
      }
    }
    // No fallback needed for v2 format
    clear();
  }

  // Circle-vs-AABB
  function circleVsAABB(cx, cz, radius, box) {
    var closestX = Math.max(box.minX, Math.min(cx, box.maxX));
    var closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
    var dx = cx - closestX;
    var dz = cz - closestZ;
    return (dx * dx + dz * dz) < (radius * radius);
  }

  function yOverlaps(feetY, bodyH, box) {
    return feetY < box.maxY && (feetY + bodyH) > box.minY;
  }

  function resolve(oldX, oldZ, newX, newZ, radius, feetY, bodyH) {
    var checkY = (feetY !== undefined);

    var tryX = newX, tryZ = oldZ;
    for (var i = 0; i < boxes.length; i++) {
      if (checkY && !yOverlaps(feetY, bodyH, boxes[i])) continue;
      if (circleVsAABB(tryX, tryZ, radius, boxes[i])) {
        tryX = oldX;
        break;
      }
    }

    var finalX = tryX, finalZ = newZ;
    for (var i = 0; i < boxes.length; i++) {
      if (checkY && !yOverlaps(feetY, bodyH, boxes[i])) continue;
      if (circleVsAABB(finalX, finalZ, radius, boxes[i])) {
        finalZ = oldZ;
        break;
      }
    }

    return { x: finalX, z: finalZ };
  }

  function sampleTerrainHeight(worldX, worldZ) {
    var best = -Infinity;
    for (var ti = 0; ti < terrains.length; ti++) {
      var t = terrains[ti];
      var localX = worldX - t.x + t.width / 2;
      var localZ = worldZ - t.z + t.depth / 2;
      if (localX < 0 || localX > t.width || localZ < 0 || localZ > t.depth) continue;
      var segs = t.segments;
      var gx = (localX / t.width) * segs;
      var gz = (localZ / t.depth) * segs;
      var ix = Math.min(Math.floor(gx), segs - 1);
      var iz = Math.min(Math.floor(gz), segs - 1);
      var fx = gx - ix;
      var fz = gz - iz;
      var cols = segs + 1;
      var h00 = t.heights[iz * cols + ix] || 0;
      var h10 = t.heights[iz * cols + ix + 1] || 0;
      var h01 = t.heights[(iz + 1) * cols + ix] || 0;
      var h11 = t.heights[(iz + 1) * cols + ix + 1] || 0;
      var h = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
      var worldH = t.y + h;
      if (worldH > best) best = worldH;
    }
    return best;
  }

  function getGroundHeight(x, z, radius, feetY) {
    var groundY = 0;
    var stepHeight = 0.5;
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (!circleVsAABB(x, z, radius, box)) continue;
      if (box.maxY <= feetY + stepHeight && box.maxY > groundY) {
        groundY = box.maxY;
      }
    }
    var th = sampleTerrainHeight(x, z);
    if (th > -Infinity && th <= feetY + stepHeight && th > groundY) {
      groundY = th;
    }
    return groundY;
  }

  function getCeilingHeight(x, z, radius, feetY, bodyH) {
    var ceiling = 999;
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (!circleVsAABB(x, z, radius, box)) continue;
      if (box.minY > feetY && box.minY < ceiling) {
        ceiling = box.minY;
      }
    }
    return ceiling;
  }

  return {
    buildFromWorld: buildFromWorld,
    buildFromScene: buildFromScene,
    resolve: resolve,
    getGroundHeight: getGroundHeight,
    getCeilingHeight: getCeilingHeight,
    addBox: addBox,
    clear: clear,
    getBoxes: function() { return boxes; }
  };
})();
