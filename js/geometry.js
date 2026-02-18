// ============================================================
// GEOMETRY — All procedural geometry builders (optimized)
// ============================================================

var Geometry = (function() {
  'use strict';

  var C = XJ.COLORS;

  // --- Material cache (reuse materials to avoid duplicates) ---
  var matCache = {};
  function mat(color, opts) {
    var key = color + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) {
      var params = { color: color };
      if (opts) { for (var k in opts) params[k] = opts[k]; }
      matCache[key] = new THREE.MeshLambertMaterial(params);
    }
    return matCache[key];
  }

  // Material with polygonOffset to prevent z-fighting on overlay surfaces
  function overlayMat(color) {
    var key = 'ov_' + color;
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshLambertMaterial({
        color: color,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
    }
    return matCache[key];
  }

  function emissiveMat(color, intensity) {
    var key = 'e_' + color + '_' + intensity;
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: intensity || 0.8 });
    }
    return matCache[key];
  }

  // --- Procedural canvas texture generators ---
  function makeNoise(ctx, w, h, alpha) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * alpha;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  // Remap UVs to world-space so textures tile consistently regardless of mesh size.
  // Uses vertex normals to pick the right axes: horizontal faces → x,z; vertical → x/z,y
  function applyWorldUVs(geo, scale) {
    var pos = geo.attributes.position.array;
    var nor = geo.attributes.normal.array;
    var uv  = geo.attributes.uv.array;
    var s = scale || 5.0;
    for (var i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      var nx = Math.abs(nor[i]), ny = Math.abs(nor[i + 1]), nz = Math.abs(nor[i + 2]);
      if (ny > nx && ny > nz) {
        // Floor / ceiling / ground — use x, z
        uv[j]     = pos[i]     / s;
        uv[j + 1] = pos[i + 2] / s;
      } else if (nx > nz) {
        // Left / right wall — use z, y
        uv[j]     = pos[i + 2] / s;
        uv[j + 1] = pos[i + 1] / s;
      } else {
        // Front / back wall — use x, y
        uv[j]     = pos[i]     / s;
        uv[j + 1] = pos[i + 1] / s;
      }
    }
    geo.attributes.uv.needsUpdate = true;
  }

  // All textures use WHITE base so material.color tints correctly:
  // white pixel × material color = full material color
  // dark pixel × material color = darkened material color (visible detail)

  function makeBuildingTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Floor division bands (strong horizontal lines every ~43px ≈ 1 storey)
    for (var y = 0; y < s; y += 43) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y, s, 3);
      // Lighter band below the line (concrete lip highlight)
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, y + 3, s, 6);
    }
    // Vertical panel seams
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (var x = 0; x < s; x += 43) {
      ctx.fillRect(x, 0, 2, s);
    }
    // Weathering streaks (dark vertical drip lines)
    for (var i = 0; i < 18; i++) {
      var sx = Math.random() * s;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.08).toFixed(3) + ')';
      ctx.fillRect(sx, Math.random() * s * 0.3, 2 + Math.random() * 4, s * 0.7 + Math.random() * s * 0.3);
    }
    // Grime at base (darker bottom)
    var grd = ctx.createLinearGradient(0, s - 60, 0, s);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, s - 60, s, 60);
    makeNoise(ctx, s, s, 28);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeGroundTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Paving slab grid (64px squares)
    for (var sy = 0; sy < s; sy += 64) {
      for (var sx = 0; sx < s; sx += 64) {
        // Random tint per slab
        var v = Math.floor(Math.random() * 30) - 15;
        ctx.fillStyle = 'rgba(0,0,0,' + (Math.max(0, -v) / 100).toFixed(3) + ')';
        ctx.fillRect(sx + 2, sy + 2, 60, 60);
        if (v > 0) {
          ctx.fillStyle = 'rgba(255,255,255,' + (v / 200).toFixed(3) + ')';
          ctx.fillRect(sx + 2, sy + 2, 60, 60);
        }
      }
    }
    // Grid lines (grout)
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (var y = 0; y <= s; y += 64) ctx.fillRect(0, y - 1, s, 3);
    for (var x = 0; x <= s; x += 64) ctx.fillRect(x - 1, 0, 3, s);
    // Dirt patches
    for (var i = 0; i < 12; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.06).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 8 + Math.random() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
    makeNoise(ctx, s, s, 20);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeRoadTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Heavy asphalt speckle
    for (var i = 0; i < 1200; i++) {
      var bright = Math.random() > 0.4;
      ctx.fillStyle = bright ? 'rgba(0,0,0,' + (0.05 + Math.random() * 0.10).toFixed(3) + ')'
                             : 'rgba(255,255,255,' + (Math.random() * 0.05).toFixed(3) + ')';
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    // Tire tracks
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(s * 0.25, 0, 10, s);
    ctx.fillRect(s * 0.72, 0, 10, s);
    // Patching / repair marks (darker squares)
    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.06 + Math.random() * 0.08).toFixed(3) + ')';
      ctx.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 40, 15 + Math.random() * 25);
    }
    // Cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      var cx = Math.random() * s, cy = Math.random() * s;
      ctx.moveTo(cx, cy);
      for (var j = 0; j < 5; j++) {
        cx += (Math.random() - 0.5) * 40;
        cy += Math.random() * 30;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    makeNoise(ctx, s, s, 18);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeSidewalkTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Paving slab grid (42px pavers)
    for (var sy = 0; sy < s; sy += 42) {
      for (var sx = 0; sx < s; sx += 42) {
        var v = Math.floor(Math.random() * 20) - 10;
        ctx.fillStyle = 'rgba(0,0,0,' + (Math.max(0, -v) / 80).toFixed(3) + ')';
        ctx.fillRect(sx + 1, sy + 1, 40, 40);
      }
    }
    // Grout lines
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var y = 0; y <= s; y += 42) ctx.fillRect(0, y, s, 2);
    for (var x = 0; x <= s; x += 42) ctx.fillRect(x, 0, 2, s);
    makeNoise(ctx, s, s, 14);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeShopWallTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Plaster texture (overlapping soft blobs)
    for (var i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.05).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 8 + Math.random() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    // Light patches (plaster variation)
    for (var i = 0; i < 15; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 25, 0, Math.PI * 2);
      ctx.fill();
    }
    // Horizontal mortar lines (brick-like subtlety)
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (var y = 0; y < s; y += 32) {
      ctx.fillRect(0, y, s, 1);
    }
    makeNoise(ctx, s, s, 16);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeBrickTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);

    var bH = 14, bW = 38, mW = 2;
    var rows = Math.ceil(s / bH) + 1;
    for (var r = 0; r < rows; r++) {
      var offset = (r % 2 === 0) ? 0 : bW / 2;
      var by = r * bH;
      for (var col = -1; col <= Math.ceil(s / bW) + 1; col++) {
        var bx = col * bW + offset;
        var shade = 0.04 + Math.random() * 0.10;
        ctx.fillStyle = 'rgba(0,0,0,' + shade.toFixed(3) + ')';
        ctx.fillRect(bx + mW, by + mW, bW - mW * 2, bH - mW * 2);
      }
    }
    // Mortar shadow at bottom of each horizontal joint
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (var y = 0; y < s; y += bH) {
      ctx.fillRect(0, y + mW - 1, s, 1);
    }
    // Weathering streaks
    for (var i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.04).toFixed(3) + ')';
      ctx.fillRect(Math.random() * s, 0, 2, s);
    }
    // Grime at base
    var grd = ctx.createLinearGradient(0, s - 40, 0, s);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, s - 40, s, 40);

    makeNoise(ctx, s, s, 16);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Clean interior wall texture (smooth paint with very subtle variation)
  function makeCleanInteriorTex() {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Very subtle brush roller marks (horizontal)
    for (var y = 0; y < s; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.005 + Math.random() * 0.01).toFixed(4) + ')';
      ctx.fillRect(0, y, s, 6);
    }
    // Tiny speckle
    makeNoise(ctx, s, s, 6);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Ceiling tile texture (clean with subtle panel edge)
  function makeCeilingTileTex() {
    var s = 128;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    // Micro pinhole pattern (acoustic tile look)
    for (var i = 0; i < 200; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.03).toFixed(3) + ')';
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    makeNoise(ctx, s, s, 4);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Pre-generate textures
  var buildingTex = makeBuildingTex();
  var brickTex = makeBrickTex();
  var groundTex = makeGroundTex();
  var roadTex = makeRoadTex();
  var sidewalkTex = makeSidewalkTex();
  var shopWallTex = makeShopWallTex();
  var cleanInteriorTex = makeCleanInteriorTex();
  var ceilingTileTex = makeCeilingTileTex();

  // Mark shared textures so editor dispose logic won't destroy them
  buildingTex._shared = true;
  brickTex._shared = true;
  groundTex._shared = true;
  roadTex._shared = true;
  sidewalkTex._shared = true;
  shopWallTex._shared = true;
  cleanInteriorTex._shared = true;
  ceilingTileTex._shared = true;

  // --- Geometry merger: collects positioned geometries, outputs one merged mesh ---
  function GeoMerger() {
    this.entries = []; // { geo, matrix }
  }
  GeoMerger.prototype.addBox = function(cx, cy, cz, w, h, d) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var m = new THREE.Matrix4();
    m.makeTranslation(cx, cy, cz);
    geo.applyMatrix4(m);
    this.entries.push(geo);
  };
  GeoMerger.prototype.addPlane = function(cx, cy, cz, w, h, rotX, rotY) {
    var geo = new THREE.PlaneGeometry(w, h);
    var m = new THREE.Matrix4();
    if (rotX) { var rx = new THREE.Matrix4(); rx.makeRotationX(rotX); m.multiply(rx); }
    if (rotY) { var ry = new THREE.Matrix4(); ry.makeRotationY(rotY); m.multiply(ry); }
    var t = new THREE.Matrix4(); t.makeTranslation(cx, cy, cz);
    m.premultiply(t);
    geo.applyMatrix4(m);
    this.entries.push(geo);
  };
  GeoMerger.prototype.addCylinder = function(cx, cy, cz, rTop, rBot, h, segs) {
    var geo = new THREE.CylinderGeometry(rTop, rBot, h, segs || 6);
    var m = new THREE.Matrix4(); m.makeTranslation(cx, cy, cz);
    geo.applyMatrix4(m);
    this.entries.push(geo);
  };
  GeoMerger.prototype.toMesh = function(material, opts) {
    if (this.entries.length === 0) return null;
    // Manually merge: concatenate all position/normal/uv buffers + update indices
    var totalVerts = 0, totalIdx = 0;
    for (var i = 0; i < this.entries.length; i++) {
      totalVerts += this.entries[i].attributes.position.count;
      totalIdx += this.entries[i].index ? this.entries[i].index.count : 0;
    }
    var positions = new Float32Array(totalVerts * 3);
    var normals = new Float32Array(totalVerts * 3);
    var uvs = new Float32Array(totalVerts * 2);
    var indices = totalIdx > 0 ? new Uint32Array(totalIdx) : null;
    var vOff = 0, iOff = 0, vBase = 0;
    for (var i = 0; i < this.entries.length; i++) {
      var g = this.entries[i];
      var pos = g.attributes.position.array;
      var nor = g.attributes.normal.array;
      var uv = g.attributes.uv ? g.attributes.uv.array : null;
      var vc = g.attributes.position.count;
      positions.set(pos, vOff * 3);
      normals.set(nor, vOff * 3);
      if (uv) uvs.set(uv, vOff * 2);
      if (g.index) {
        var idx = g.index.array;
        for (var j = 0; j < idx.length; j++) {
          indices[iOff + j] = idx[j] + vBase;
        }
        iOff += idx.length;
      }
      vBase += vc;
      vOff += vc;
      g.dispose();
    }
    var merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (indices) merged.setIndex(new THREE.BufferAttribute(indices, 1));
    var mesh = new THREE.Mesh(merged, material);
    if (opts && opts.castShadow) mesh.castShadow = true;
    if (opts && opts.receiveShadow) mesh.receiveShadow = true;
    return mesh;
  };

  // -------------------------------------------------------
  // GROUND + SKY
  // -------------------------------------------------------
  function buildGround(scene) {
    var geo = new THREE.PlaneGeometry(XJ.WORLD.width, XJ.WORLD.depth);
    // Pre-set world-space UVs on the plane before rotation (plane is in XY, then rotated to XZ)
    var pos = geo.attributes.position.array;
    var uv = geo.attributes.uv.array;
    var sc = 5.0; // 5m per texture tile
    for (var i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      // PlaneGeometry is in XY before rotation; after -90° X rotation, X→X and Y→Z
      uv[j]     = (pos[i] + XJ.WORLD.width / 2)  / sc;
      uv[j + 1] = (pos[i + 1] + XJ.WORLD.depth / 2) / sc;
    }
    geo.attributes.uv.needsUpdate = true;
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: C.ground, map: groundTex }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(XJ.WORLD.width / 2, 0, XJ.WORLD.depth / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function buildSky(scene) {
    var w = 2048, h = 1024;
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Sky gradient (equirectangular: top=zenith, middle=horizon, bottom=nadir)
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, '#1a3a6a');
    grad.addColorStop(0.15, '#2a5a8a');
    grad.addColorStop(0.30, '#5a8abb');
    grad.addColorStop(0.40, '#88b8dd');
    grad.addColorStop(0.46, '#c0ddef');
    grad.addColorStop(0.50, '#dde8f0');
    grad.addColorStop(0.54, '#c8d0d4');
    grad.addColorStop(0.70, '#8a9498');
    grad.addColorStop(1.00, '#5a6466');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sun glow (warm radial near horizon)
    var sunX = w * 0.25, sunY = h * 0.46;
    var sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.18);
    sg.addColorStop(0.0, 'rgba(255,252,235,0.7)');
    sg.addColorStop(0.2, 'rgba(255,235,190,0.4)');
    sg.addColorStop(0.5, 'rgba(255,210,160,0.15)');
    sg.addColorStop(1.0, 'rgba(255,200,150,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);

    // Clouds (fluffy overlapping ellipses in upper sky)
    for (var i = 0; i < 50; i++) {
      var cx = Math.random() * w;
      var cy = h * (0.2 + Math.random() * 0.22);
      var cw = 50 + Math.random() * 140;
      var ch = 12 + Math.random() * 28;
      var alpha = 0.12 + Math.random() * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
      // Puffs
      for (var j = 0; j < 4; j++) {
        var dx = (Math.random() - 0.5) * cw * 1.4;
        var dy = (Math.random() - 0.5) * ch * 0.8;
        var dr = 8 + Math.random() * cw * 0.35;
        ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, dr, dr * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Horizon haze
    var hz = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.54);
    hz.addColorStop(0.0, 'rgba(210,225,238,0)');
    hz.addColorStop(0.3, 'rgba(210,225,238,0.25)');
    hz.addColorStop(0.7, 'rgba(200,215,228,0.25)');
    hz.addColorStop(1.0, 'rgba(200,215,228,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, w, h);

    var tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    scene.environment = tex;

    // Atmospheric fog matching horizon
    scene.fog = new THREE.Fog(0xc8dae8, 50, 140);

    return null;
  }

  // -------------------------------------------------------
  // ROADS + SIDEWALKS + PATH (merged into 3 draw calls: road, sidewalk, dashes)
  // -------------------------------------------------------
  function buildRoads(scene) {
    var group = new THREE.Group();
    var roadMerger = new GeoMerger();
    var sidewalkMerger = new GeoMerger();
    var lineMerger = new GeoMerger();
    var kerbMerger = new GeoMerger();

    // Kerb / pavement dimensions
    var kerbH = 0.12;  // 12cm kerb height (UK standard)
    var kerbD = 0.08;  // kerb depth (lip width)
    var pavY = kerbH;  // pavement surface sits at kerb height

    for (var i = 0; i < XJ.ROADS.length; i++) {
      var r = XJ.ROADS[i];
      // Road surface (y=0.02 to clear ground)
      roadMerger.addPlane(r.x + r.w/2, 0.02, r.z + r.d/2, r.w, r.d, -Math.PI/2, 0);

      // Centre-line dashes
      if (r.w > r.d) {
        for (var dx = 0; dx < r.w; dx += 4) {
          lineMerger.addPlane(r.x + dx + 1, 0.03, r.z + r.d/2, Math.min(2, r.w - dx), 0.15, -Math.PI/2, 0);
        }
        // Kerbs along north and south edges (thin boxes: road-length, kerbH tall, kerbD deep)
        kerbMerger.addBox(r.x + r.w/2, kerbH/2, r.z - kerbD/2, r.w, kerbH, kerbD);
        kerbMerger.addBox(r.x + r.w/2, kerbH/2, r.z + r.d + kerbD/2, r.w, kerbH, kerbD);
      } else {
        for (var dz = 0; dz < r.d; dz += 4) {
          lineMerger.addPlane(r.x + r.w/2, 0.03, r.z + dz + 1, 0.15, Math.min(2, r.d - dz), -Math.PI/2, 0);
        }
        kerbMerger.addBox(r.x - kerbD/2, kerbH/2, r.z + r.d/2, kerbD, kerbH, r.d);
        kerbMerger.addBox(r.x + r.w + kerbD/2, kerbH/2, r.z + r.d/2, kerbD, kerbH, r.d);
      }
    }

    // Sidewalk paths — raised to kerb height
    if (XJ.PATH) {
      var paths = Array.isArray(XJ.PATH) ? XJ.PATH : [XJ.PATH];
      for (var pi = 0; pi < paths.length; pi++) {
        var p = paths[pi];
        sidewalkMerger.addPlane(p.x + p.w/2, pavY + 0.01, p.z + p.d/2, p.w, p.d, -Math.PI/2, 0);
      }
    }

    var roadMatTex = new THREE.MeshLambertMaterial({ color: C.road, map: roadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    var roadMesh = roadMerger.toMesh(roadMatTex, { receiveShadow: true });
    if (roadMesh) { applyWorldUVs(roadMesh.geometry, 4.0); group.add(roadMesh); }
    var swMatTex = new THREE.MeshLambertMaterial({ color: C.sidewalk, map: sidewalkTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    var swMesh = sidewalkMerger.toMesh(swMatTex, { receiveShadow: true });
    if (swMesh) { applyWorldUVs(swMesh.geometry, 2.5); group.add(swMesh); }
    // Kerb stone (slightly lighter than sidewalk)
    var kerbMat = new THREE.MeshLambertMaterial({ color: 0xC0B8A8 });
    var kerbMesh = kerbMerger.toMesh(kerbMat, { castShadow: true, receiveShadow: true });
    if (kerbMesh) group.add(kerbMesh);
    var lineMat = new THREE.MeshLambertMaterial({ color: C.roadLine, emissive: C.roadLine, emissiveIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var lineMesh = lineMerger.toMesh(lineMat);
    if (lineMesh) group.add(lineMesh);

    scene.add(group);
    return group;
  }

  // -------------------------------------------------------
  // SHOP BUILDING (merged by material: ext, int, trim)
  // -------------------------------------------------------
  function buildShop(scene) {
    var group = new THREE.Group();
    var shop = XJ.SHOP;

    var extMerger = new GeoMerger();
    var intMerger = new GeoMerger();
    var trimMerger = new GeoMerger();

    // --- Floor planes per room (y=0.05 to clear ground, with polygonOffset) ---
    for (var ri = 0; ri < shop.rooms.length; ri++) {
      var room = shop.rooms[ri];
      var rw = room.maxX - room.minX;
      var rd = room.maxZ - room.minZ;
      var fg = new THREE.PlaneGeometry(rw, rd);
      var fm = new THREE.Mesh(fg, overlayMat(room.color));
      fm.rotation.x = -Math.PI/2;
      fm.position.set(room.minX + rw/2, 0.05, room.minZ + rd/2);
      fm.receiveShadow = true;
      group.add(fm);
    }

    // Ceiling is built by buildShopFurniture (panel grid system)
    var cw = shop.maxX - shop.minX;
    var cd = shop.maxZ - shop.minZ;

    // --- Flat roof (thin box so it renders from all angles) ---
    var roofGeo = new THREE.BoxGeometry(cw + 0.6, 0.15, cd + 0.6);
    var roofMesh = new THREE.Mesh(roofGeo, mat(0x666666));
    roofMesh.position.set(shop.minX + cw/2, shop.ceilingY + 0.15, shop.minZ + cd/2);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // --- Walls (merged by material) ---
    var wallH = shop.wallHeight;
    var thick = shop.wallThick;

    for (var wi = 0; wi < shop.walls.length; wi++) {
      var wall = shop.walls[wi];
      var isExt = wall.type === 'ext';
      var merger = isExt ? extMerger : intMerger;
      var isH = (wall.az === wall.bz);
      var isV = (wall.ax === wall.bx);

      var wallDoors = [];
      for (var di = 0; di < shop.doors.length; di++) {
        var door = shop.doors[di];
        if (isH && door.orient === 'h' && Math.abs(door.z - wall.az) < 0.5) wallDoors.push(door);
        if (isV && door.orient === 'v' && Math.abs(door.x - wall.ax) < 0.5) wallDoors.push(door);
      }

      // Trim sits OUTSIDE the wall face — no overlapping geometry
      var doorH = 2.2;
      var tOff = thick/2 + 0.035;  // trim center offset from wall center
      var tD = 0.05;               // trim depth (thin strip)
      var tW = 0.08;               // trim width (strip width)

      if (isH) {
        var z = wall.az;
        var x1 = Math.min(wall.ax, wall.bx), x2 = Math.max(wall.ax, wall.bx);
        wallDoors.sort(function(a, b) { return a.x - b.x; });
        var cursor = x1;
        for (var di = 0; di < wallDoors.length; di++) {
          var d = wallDoors[di];
          var ds = d.x - d.w/2, de = d.x + d.w/2;
          if (ds > cursor + 0.01) { var sw = ds - cursor; merger.addBox(cursor + sw/2, wallH/2, z, sw, wallH, thick); }

          if (d.type === 'win') {
            // Display window opening: solid stall riser below, solid wall above
            var wb = d.winBot || 0.45, wt = d.winTop || 2.73;
            if (wb > 0.01) merger.addBox(d.x, wb / 2, z, d.w - 0.02, wb, thick);
            var abvH = wallH - wt;
            if (abvH > 0.01) merger.addBox(d.x, wt + abvH / 2, z, d.w - 0.02, abvH, thick);
          } else {
            var aboveH = wallH - doorH - 0.02;
            if (aboveH > 0.01) merger.addBox(d.x, doorH + 0.02 + aboveH/2, z, d.w - 0.02, aboveH, thick);
            // Jambs: thin boxes on front & back face, fully outside wall volume
            trimMerger.addBox(ds, doorH/2, z + tOff, tW, doorH, tD);
            trimMerger.addBox(ds, doorH/2, z - tOff, tW, doorH, tD);
            trimMerger.addBox(de, doorH/2, z + tOff, tW, doorH, tD);
            trimMerger.addBox(de, doorH/2, z - tOff, tW, doorH, tD);
            // Lintel: thin boxes on front & back face
            trimMerger.addBox(d.x, doorH, z + tOff, d.w + tW, tW, tD);
            trimMerger.addBox(d.x, doorH, z - tOff, d.w + tW, tW, tD);
          }
          cursor = de;
        }
        if (cursor < x2 - 0.01) { var sw = x2 - cursor; merger.addBox(cursor + sw/2, wallH/2, z, sw, wallH, thick); }
      } else if (isV) {
        var x = wall.ax;
        var z1 = Math.min(wall.az, wall.bz), z2 = Math.max(wall.az, wall.bz);
        wallDoors.sort(function(a, b) { return a.z - b.z; });
        var cursor = z1;
        for (var di = 0; di < wallDoors.length; di++) {
          var d = wallDoors[di];
          var ds = d.z - d.w/2, de = d.z + d.w/2;
          if (ds > cursor + 0.01) { var sd = ds - cursor; merger.addBox(x, wallH/2, cursor + sd/2, thick, wallH, sd); }

          if (d.type === 'win') {
            var wb = d.winBot || 0.45, wt = d.winTop || 2.73;
            if (wb > 0.01) merger.addBox(x, wb / 2, d.z, thick, wb, d.w - 0.02);
            var abvH = wallH - wt;
            if (abvH > 0.01) merger.addBox(x, wt + abvH / 2, d.z, thick, abvH, d.w - 0.02);
          } else {
            var aboveH = wallH - doorH - 0.02;
            if (aboveH > 0.01) merger.addBox(x, doorH + 0.02 + aboveH/2, d.z, thick, aboveH, d.w - 0.02);
            // Jambs: thin boxes on east & west face, fully outside wall volume
            trimMerger.addBox(x + tOff, doorH/2, ds, tD, doorH, tW);
            trimMerger.addBox(x - tOff, doorH/2, ds, tD, doorH, tW);
            trimMerger.addBox(x + tOff, doorH/2, de, tD, doorH, tW);
            trimMerger.addBox(x - tOff, doorH/2, de, tD, doorH, tW);
            // Lintel: thin boxes on east & west face
            trimMerger.addBox(x + tOff, doorH, d.z, tD, tW, d.w + tW);
            trimMerger.addBox(x - tOff, doorH, d.z, tD, tW, d.w + tW);
          }
          cursor = de;
        }
        if (cursor < z2 - 0.01) { var sd = z2 - cursor; merger.addBox(x, wallH/2, cursor + sd/2, thick, wallH, sd); }
      }
    }

    // N/E/W walls are buried inside terrace buildings — no windows needed
    var glassMerger = new GeoMerger();

    // --- South wall (z=47) — Victorian plate glass display windows ---
    // Glass sits inside the wall opening; frames on the outer face
    var glassZ = 47 + thick/2 - 0.01;       // glass inside opening (slightly recessed)
    var frameZ = 47 + thick/2 + 0.04;       // frames on outer face
    var stallH = 0.45;    // stall riser height
    var swBot = stallH;
    var swTop = 2.4;      // top of main display glass
    var swH = swTop - swBot;
    var transH = 0.28;    // transom light height
    var transTop = swTop + transH + 0.05;
    var sfw = 0.05;       // frame strip width
    var smW = 0.035;      // mullion width

    // Two display window bays either side of entrance
    var bays = [
      { left: 74.3, right: 77.0 },   // left of door
      { left: 79.0, right: 81.7 }    // right of door
    ];
    for (var bi = 0; bi < bays.length; bi++) {
      var bay = bays[bi];
      var bw = bay.right - bay.left;
      var bcx = (bay.left + bay.right) / 2;
      var bcy = swBot + swH / 2;

      // Stall riser (dark decorative panel on outer face of solid wall below opening)
      trimMerger.addBox(bcx, stallH / 2, frameZ, bw, stallH, 0.06);

      // Main plate glass pane (inside wall opening — see-through)
      glassMerger.addPlane(bcx, bcy, glassZ, bw, swH, 0, 0);

      // Transom light above
      var tcy = swTop + sfw + transH / 2;
      glassMerger.addPlane(bcx, tcy, glassZ, bw, transH, 0, 0);

      // Transom bar
      trimMerger.addBox(bcx, swTop + sfw / 2, frameZ, bw + sfw, sfw, sfw);

      // Frame surround (on outer face)
      trimMerger.addBox(bcx, swBot - sfw / 2, frameZ, bw + sfw * 2, sfw, sfw);
      trimMerger.addBox(bcx, transTop + sfw / 2, frameZ, bw + sfw * 2, sfw, sfw);
      trimMerger.addBox(bay.left - sfw / 2, (swBot + transTop) / 2, frameZ, sfw, transTop - swBot + sfw, sfw);
      trimMerger.addBox(bay.right + sfw / 2, (swBot + transTop) / 2, frameZ, sfw, transTop - swBot + sfw, sfw);

      // Mullions (~1.2m spacing)
      var nMull = Math.max(0, Math.floor(bw / 1.2) - 1);
      if (nMull > 0) {
        var mStep = bw / (nMull + 1);
        for (var mi = 1; mi <= nMull; mi++) {
          var mx = bay.left + mi * mStep;
          trimMerger.addBox(mx, bcy, frameZ, smW, swH, sfw);
          trimMerger.addBox(mx, tcy, frameZ, smW, transH, sfw);
        }
      }
    }

    var extMesh = extMerger.toMesh(new THREE.MeshLambertMaterial({ color: C.shopExt, map: shopWallTex }), { castShadow: true, receiveShadow: true });
    if (extMesh) { applyWorldUVs(extMesh.geometry, 3.0); group.add(extMesh); }
    var intMesh = intMerger.toMesh(new THREE.MeshLambertMaterial({ color: 0xF0EDE8, map: cleanInteriorTex }), { castShadow: true, receiveShadow: true });
    if (intMesh) { applyWorldUVs(intMesh.geometry, 2.0); group.add(intMesh); }
    var trimMat = new THREE.MeshLambertMaterial({ color: C.shopTrim, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    var trimMesh = trimMerger.toMesh(trimMat, { castShadow: true });
    if (trimMesh) group.add(trimMesh);
    var shopGlassMat = new THREE.MeshLambertMaterial({ color: C.window, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    var glassMesh = glassMerger.toMesh(shopGlassMat);
    if (glassMesh) group.add(glassMesh);

    scene.add(group);
    return group;
  }

  function addMergedWindows(glassMerger, frameMerger, start, end, pos, wallH, thick, isH) {
    var winW = 1.2, winH = 1.2, winY = 1.5, spacing = 3;
    var mid = (start + end) / 2;
    var count = Math.floor((end - start - 2) / spacing);
    if (count < 1) count = 1;
    for (var i = 0; i < count; i++) {
      var p = mid + (i - (count-1)/2) * spacing;
      if (p < start + 1 || p > end - 1) continue;
      if (isH) {
        glassMerger.addPlane(p, winY, pos + thick/2 + 0.08, winW, winH, 0, 0);
        frameMerger.addBox(p, winY, pos + thick/2 + 0.1, winW + 0.1, winH + 0.1, 0.05);
      } else {
        glassMerger.addPlane(pos + thick/2 + 0.08, winY, p, winW, winH, 0, Math.PI/2);
        frameMerger.addBox(pos + thick/2 + 0.1, winY, p, 0.05, winH + 0.1, winW + 0.1);
      }
    }
  }

  // -------------------------------------------------------
  // HIGH-RISE BUILDINGS (body merged by color + windows merged)
  // -------------------------------------------------------
  function buildHighRises(scene) {
    var group = new THREE.Group();
    var buildings = XJ.HIGHRISES;
    var colorMergers = {};      // concrete/render buildings
    var brickMergers = {};      // brick buildings
    // 4 window groups: warm bright, warm dim, cool, dark
    var winMergers = [new GeoMerger(), new GeoMerger(), new GeoMerger(), new GeoMerger()];

    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var mergers = b.brick ? brickMergers : colorMergers;
      if (!mergers[b.color]) mergers[b.color] = new GeoMerger();
      var cm = mergers[b.color];
      var yBase = b.yBase || 0;
      // Main body
      cm.addBox(b.x + b.w/2, yBase + b.h/2, b.z + b.d/2, b.w, b.h, b.d);
      var vis = getFaceVisibility(b);
      // Architectural details: cornices, parapets, plinth
      addBuildingDetails(cm, b, vis);
      // Windows + sills (sills merge into same color group)
      addHighRiseWindows(winMergers, cm, b, vis);
    }

    // Concrete/render buildings
    for (var color in colorMergers) {
      var bMat = new THREE.MeshLambertMaterial({ color: parseInt(color), map: buildingTex });
      var m = colorMergers[color].toMesh(bMat, { castShadow: true, receiveShadow: true });
      if (m) { applyWorldUVs(m.geometry, 6.0); group.add(m); }
    }
    // Brick buildings (tighter UV tiling for visible brick courses)
    for (var color in brickMergers) {
      var bMat = new THREE.MeshLambertMaterial({ color: parseInt(color), map: brickTex });
      var m = brickMergers[color].toMesh(bMat, { castShadow: true, receiveShadow: true });
      if (m) { applyWorldUVs(m.geometry, 4.0); group.add(m); }
    }

    // Window groups: varied emissive intensity + colour (4 draw calls total)
    var winStyles = [
      { color: 0xFFEEBB, emissive: 0xFFEEBB, intensity: 0.6 },  // warm bright (50%)
      { color: 0xDDCC99, emissive: 0xDDCC99, intensity: 0.3 },  // warm dim (25%)
      { color: 0xAABBDD, emissive: 0xAABBDD, intensity: 0.4 },  // cool blue (10%)
      { color: 0x222222, emissive: 0x111111, intensity: 0.05 }   // dark / off (15%)
    ];
    for (var wi = 0; wi < winStyles.length; wi++) {
      var ws = winStyles[wi];
      var wMat = new THREE.MeshLambertMaterial({
        color: ws.color, emissive: ws.emissive, emissiveIntensity: ws.intensity,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      });
      var wMesh = winMergers[wi].toMesh(wMat);
      if (wMesh) group.add(wMesh);
    }

    scene.add(group);
    return group;
  }

  // Check if a building face is fully hidden by world boundary or an adjacent building
  function getFaceVisibility(b) {
    var W = XJ.WORLD;
    var bTop = (b.yBase || 0) + b.h;
    var vis = { front: true, back: true, left: true, right: true };
    if (b.z + b.d >= W.depth - 0.1) vis.front = false;
    if (b.z <= 0.1)                 vis.back  = false;
    if (b.x <= 0.1)                 vis.left  = false;
    if (b.x + b.w >= W.width - 0.1) vis.right = false;
    // Check adjacent buildings
    for (var i = 0; i < XJ.HIGHRISES.length; i++) {
      var o = XJ.HIGHRISES[i];
      if (o === b) continue;
      var oTop = (o.yBase || 0) + o.h;
      // Front (+z): another building flush at b.z+b.d, covering full width & at least as tall
      if (vis.front && Math.abs(o.z - (b.z + b.d)) < 0.2 &&
          o.x <= b.x + 0.1 && o.x + o.w >= b.x + b.w - 0.1 && oTop >= bTop - 0.1) vis.front = false;
      // Back (-z): another building flush at b.z
      if (vis.back && Math.abs(o.z + o.d - b.z) < 0.2 &&
          o.x <= b.x + 0.1 && o.x + o.w >= b.x + b.w - 0.1 && oTop >= bTop - 0.1) vis.back = false;
      // Left (-x): another building flush at b.x
      if (vis.left && Math.abs(o.x + o.w - b.x) < 0.2 &&
          o.z <= b.z + 0.1 && o.z + o.d >= b.z + b.d - 0.1 && oTop >= bTop - 0.1) vis.left = false;
      // Right (+x): another building flush at b.x+b.w
      if (vis.right && Math.abs(o.x - (b.x + b.w)) < 0.2 &&
          o.z <= b.z + 0.1 && o.z + o.d >= b.z + b.d - 0.1 && oTop >= bTop - 0.1) vis.right = false;
    }
    return vis;
  }

  // 3D architectural detail: cornices every floor, roof parapet, base plinth
  function addBuildingDetails(merger, b, vis) {
    var flrH = 3.0;
    var yBase = b.yBase || 0;
    var topY = yBase + b.h;
    var numFloors = Math.floor(b.h / flrH);

    // --- Floor cornices (horizontal ledges protruding from face) ---
    var ledgeP = 0.2;   // protrusion from face
    var ledgeH = 0.15;  // height of ledge
    for (var f = 1; f <= numFloors; f++) {
      var ly = yBase + f * flrH;
      if (ly > topY - 0.5) continue;
      if (vis.front) merger.addBox(b.x + b.w/2, ly, b.z + b.d + ledgeP/2, b.w + 0.05, ledgeH, ledgeP);
      if (vis.back)  merger.addBox(b.x + b.w/2, ly, b.z - ledgeP/2,       b.w + 0.05, ledgeH, ledgeP);
      if (vis.left)  merger.addBox(b.x - ledgeP/2,       ly, b.z + b.d/2, ledgeP, ledgeH, b.d + 0.05);
      if (vis.right) merger.addBox(b.x + b.w + ledgeP/2, ly, b.z + b.d/2, ledgeP, ledgeH, b.d + 0.05);
    }

    // --- Roof parapet (raised rim around top) ---
    var parH = 0.6, parD = 0.3;
    if (vis.front) merger.addBox(b.x + b.w/2,          topY + parH/2, b.z + b.d + parD/2, b.w + parD * 2, parH, parD);
    if (vis.back)  merger.addBox(b.x + b.w/2,          topY + parH/2, b.z - parD/2,       b.w + parD * 2, parH, parD);
    if (vis.left)  merger.addBox(b.x - parD/2,         topY + parH/2, b.z + b.d/2,        parD, parH, b.d + parD * 2);
    if (vis.right) merger.addBox(b.x + b.w + parD/2,   topY + parH/2, b.z + b.d/2,        parD, parH, b.d + parD * 2);

    // --- Base plinth (wider strip at ground level) — only for ground-level buildings ---
    if (yBase === 0) {
      var plH = 0.5, plP = 0.18;
      if (vis.front) merger.addBox(b.x + b.w/2,          plH/2, b.z + b.d + plP/2, b.w + plP * 2, plH, plP);
      if (vis.back)  merger.addBox(b.x + b.w/2,          plH/2, b.z - plP/2,       b.w + plP * 2, plH, plP);
      if (vis.left)  merger.addBox(b.x - plP/2,          plH/2, b.z + b.d/2,       plP, plH, b.d);
      if (vis.right) merger.addBox(b.x + b.w + plP/2,    plH/2, b.z + b.d/2,       plP, plH, b.d);
    }
  }

  // Seeded random for deterministic window variation
  var _wseed = 7;
  function wrand() { _wseed = (_wseed * 16807 + 11) % 2147483647; return (_wseed & 0x7fffffff) / 2147483647; }

  function addHighRiseWindows(winMergers, detailMerger, b, vis) {
    var winW = 1.0, winH = 1.2;
    var spH = 2.5;   // horizontal spacing between window centers
    var flrH = 3.0;  // floor height
    var off = 0.06;   // window pane offset from face
    var yBase = b.yBase || 0;

    // Sill dimensions
    var sillW = winW + 0.2;  // wider than window
    var sillH = 0.08;
    var sillP = 0.18;        // protrusion from face

    var numFloors = Math.floor(b.h / flrH);

    // shopFace: 'front' means +z face has shops (skip ground floor windows there)
    //           'back' means -z face has shops
    var skipFrontGF = (b.shopFace === 'front');
    var skipBackGF  = (b.shopFace === 'back');

    // Pick a window group: 0=warm bright(50%), 1=warm dim(25%), 2=cool(10%), 3=dark(15%)
    function pickGroup() {
      var r = wrand();
      if (r < 0.50) return 0;
      if (r < 0.75) return 1;
      if (r < 0.85) return 2;
      return 3;
    }

    // Width-direction windows (front & back faces)
    var nW = Math.max(1, Math.floor((b.w - 1) / spH));
    var startW = b.x + (b.w - (nW - 1) * spH) / 2;

    for (var f = 0; f < numFloors; f++) {
      var wy = yBase + flrH * f + flrH * 0.5;
      if (wy + winH/2 > yBase + b.h - 0.5) continue;
      var isGroundFloor = (wy < 3.5);
      for (var i = 0; i < nW; i++) {
        var wx = startW + i * spH;
        var sillY = wy - winH/2 - sillH/2;
        if (vis.front && !(isGroundFloor && skipFrontGF)) {
          winMergers[pickGroup()].addPlane(wx, wy, b.z + b.d + off, winW, winH, 0, 0);
          detailMerger.addBox(wx, sillY, b.z + b.d + sillP/2, sillW, sillH, sillP);
        }
        if (vis.back && !(isGroundFloor && skipBackGF)) {
          winMergers[pickGroup()].addPlane(wx, wy, b.z - off, winW, winH, 0, Math.PI);
          detailMerger.addBox(wx, sillY, b.z - sillP/2, sillW, sillH, sillP);
        }
      }
    }

    // Depth-direction windows (left & right faces)
    var nD = Math.max(1, Math.floor((b.d - 1) / spH));
    var startD = b.z + (b.d - (nD - 1) * spH) / 2;

    for (var f = 0; f < numFloors; f++) {
      var wy = yBase + flrH * f + flrH * 0.5;
      if (wy + winH/2 > yBase + b.h - 0.5) continue;
      for (var i = 0; i < nD; i++) {
        var wz = startD + i * spH;
        var sillY = wy - winH/2 - sillH/2;
        if (vis.left) {
          winMergers[pickGroup()].addPlane(b.x - off, wy, wz, winW, winH, 0, Math.PI/2);
          detailMerger.addBox(b.x - sillP/2, sillY, wz, sillP, sillH, sillW);
        }
        if (vis.right) {
          winMergers[pickGroup()].addPlane(b.x + b.w + off, wy, wz, winW, winH, 0, -Math.PI/2);
          detailMerger.addBox(b.x + b.w + sillP/2, sillY, wz, sillP, sillH, sillW);
        }
      }
    }
  }

  // -------------------------------------------------------
  // LAMP POSTS (InstancedMesh for poles + InstancedMesh for heads = 2 draw calls)
  // -------------------------------------------------------
  function buildLamps(scene) {
    var lamps = XJ.LAMPS;
    var count = lamps.length;
    var group = new THREE.Group();

    var poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.0, 6);
    var poleMeshes = new THREE.InstancedMesh(poleGeo, mat(0x333333), count);
    poleMeshes.castShadow = true;

    var headGeo = new THREE.SphereGeometry(0.2, 8, 6);
    var headMeshes = new THREE.InstancedMesh(headGeo, emissiveMat(C.lampGlow, 1.0), count);

    var dummy = new THREE.Object3D();
    for (var i = 0; i < count; i++) {
      dummy.position.set(lamps[i].x, 2.0, lamps[i].z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleMeshes.setMatrixAt(i, dummy.matrix);

      dummy.position.set(lamps[i].x, 4.1, lamps[i].z);
      dummy.updateMatrix();
      headMeshes.setMatrixAt(i, dummy.matrix);
    }

    group.add(poleMeshes);
    group.add(headMeshes);
    scene.add(group);
    return group;
  }

  // -------------------------------------------------------
  // SHOP FRONT CANVAS HELPERS — rich signs & window displays
  // -------------------------------------------------------

  function drawStar(ctx, cx, cy, r, points) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var a = (i * Math.PI / points) - Math.PI / 2;
      var rad = i % 2 === 0 ? r : r * 0.4;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      else ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawHeart(ctx, cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.3);
    ctx.bezierCurveTo(cx - size * 0.5, cy - size * 0.3, cx - size, cy + size * 0.1, cx, cy + size * 0.65);
    ctx.bezierCurveTo(cx + size, cy + size * 0.1, cx + size * 0.5, cy - size * 0.3, cx, cy + size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Create fascia sign canvas based on shop style
  function makeShopSignCanvas(shop) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    var ctx = c.getContext('2d');
    var w = 512, h = 96;

    if (shop.style === 'fastfood') {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#DD2200');
      grad.addColorStop(1, '#991100');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Gold border
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      // Golden arches "M"
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 72px Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('M', 18, h * 0.48);
      // Name
      ctx.font = 'bold 38px Arial';
      ctx.textAlign = 'center';
      ctx.fillText("McDougal's", w * 0.58, h * 0.36);
      // Subtitle
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '15px Arial';
      ctx.fillText('BURGERS \u2022 FRIES \u2022 SHAKES', w * 0.58, h * 0.72);

    } else if (shop.style === 'charity') {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#7744AA');
      grad.addColorStop(1, '#553388');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Heart
      ctx.fillStyle = '#FF6699';
      drawHeart(ctx, 55, 18, 30);
      // Name
      ctx.fillStyle = '#F0E0C0';
      ctx.font = 'bold 34px Georgia';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Hope & Heart', w * 0.58, h * 0.36);
      ctx.fillStyle = '#DDBBEE';
      ctx.font = 'italic 17px Georgia';
      ctx.fillText('Charity Shop', w * 0.58, h * 0.72);

    } else if (shop.style === 'slots') {
      var grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#1A0033');
      grad.addColorStop(0.5, '#330055');
      grad.addColorStop(1, '#1A0033');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Gold border with glow
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 6;
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.shadowBlur = 0;
      // Stars
      ctx.fillStyle = '#FFD700';
      drawStar(ctx, 35, h / 2, 12, 5);
      drawStar(ctx, w - 35, h / 2, 12, 5);
      drawStar(ctx, 80, 14, 7, 5);
      drawStar(ctx, w - 80, 14, 7, 5);
      // Text
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LUCKY SPINS', w / 2, h * 0.36);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FF6600';
      ctx.font = 'bold 15px Arial';
      ctx.fillText('\u2605 SLOTS \u2022 ROULETTE \u2022 JACKPOTS \u2605', w / 2, h * 0.72);

    } else if (shop.style === 'empty') {
      ctx.fillStyle = '#8A8070';
      ctx.fillRect(0, 0, w, h);
      // Peeling paint effect
      for (var i = 0; i < 12; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.08).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
      // Water damage streaks
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.06).toFixed(3) + ')';
        ctx.fillRect(Math.random() * w, 0, 3 + Math.random() * 8, h);
      }
      // Faded old sign (barely visible)
      ctx.fillStyle = 'rgba(60,50,40,0.15)';
      ctx.font = 'bold 28px Georgia';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NEWSAGENT', w / 2, h * 0.5);

    } else {
      // Default Victorian style
      var col = shop.color;
      var rc = (col >> 16) & 0xFF, gc = (col >> 8) & 0xFF, bc = col & 0xFF;
      ctx.fillStyle = 'rgb(' + rc + ',' + gc + ',' + bc + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#F0E0C0';
      ctx.font = 'bold 36px Georgia';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(shop.name, w / 2, h * 0.5);
    }
    return c;
  }

  // Create window display canvas for styled shops
  function makeWindowDisplayCanvas(style) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var ctx = c.getContext('2d');
    var w = 512, h = 512;

    if (style === 'fastfood') {
      // Bright interior
      ctx.fillStyle = '#FFF5E8';
      ctx.fillRect(0, 0, w, h);
      // Menu board
      var grad = ctx.createLinearGradient(w * 0.08, h * 0.03, w * 0.08, h * 0.45);
      grad.addColorStop(0, '#BB0000'); grad.addColorStop(1, '#880000');
      ctx.fillStyle = grad;
      roundRect(ctx, w * 0.08, h * 0.03, w * 0.84, h * 0.42, 8); ctx.fill();
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
      roundRect(ctx, w * 0.1, h * 0.05, w * 0.8, h * 0.38, 6); ctx.stroke();
      // Menu title
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold ' + (h * 0.06) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText('MENU', w / 2, h * 0.12);
      // Items
      ctx.fillStyle = '#FFFFFF';
      ctx.font = (h * 0.038) + 'px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Big McDougal', w * 0.15, h * 0.20);
      ctx.fillText('Chicken Royale', w * 0.15, h * 0.26);
      ctx.fillText('Fries (Large)', w * 0.15, h * 0.32);
      ctx.fillText('McDougal Meal', w * 0.15, h * 0.38);
      ctx.textAlign = 'right';
      ctx.fillText('\u00A34.99', w * 0.85, h * 0.20);
      ctx.fillText('\u00A35.49', w * 0.85, h * 0.26);
      ctx.fillText('\u00A32.49', w * 0.85, h * 0.32);
      ctx.fillText('\u00A36.99', w * 0.85, h * 0.38);
      // OPEN sign
      ctx.fillStyle = '#00AA00';
      roundRect(ctx, w * 0.3, h * 0.52, w * 0.4, h * 0.1, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + (h * 0.065) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText('OPEN', w / 2, h * 0.585);
      // Counter
      ctx.fillStyle = '#8B4513'; ctx.fillRect(0, h * 0.75, w, h * 0.25);
      ctx.fillStyle = '#DEB887'; ctx.fillRect(0, h * 0.75, w, h * 0.02);
      // Big M
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold ' + (h * 0.1) + 'px Arial';
      ctx.fillText('M', w / 2, h * 0.7);

    } else if (style === 'charity') {
      // Soft warm interior
      var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#FFF5E6'); bgGrad.addColorStop(1, '#F0E8D8');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
      // Banner
      ctx.fillStyle = '#7744AA';
      roundRect(ctx, w * 0.05, h * 0.02, w * 0.9, h * 0.08, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + (h * 0.045) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText('DONATIONS WELCOME', w / 2, h * 0.07);
      // Shelves with items (more clutter)
      var shelfColors = ['#CC3333', '#3366CC', '#33AA33', '#CC9933', '#AA33AA', '#3399AA', '#CC6633', '#6633AA', '#DD7799', '#449966'];
      for (var shelf = 0; shelf < 3; shelf++) {
        var sy = h * (0.16 + shelf * 0.22);
        ctx.fillStyle = '#A0764A';
        ctx.fillRect(w * 0.04, sy + h * 0.15, w * 0.92, h * 0.025);
        // Shelf bracket shadows
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(w * 0.04, sy + h * 0.175, w * 0.92, h * 0.01);
        for (var item = 0; item < 8; item++) {
          ctx.fillStyle = shelfColors[(shelf * 8 + item) % shelfColors.length];
          var iw = w * (0.04 + Math.random() * 0.06);
          var ih = h * (0.04 + Math.random() * 0.10);
          var ix = w * (0.06 + item * 0.11) + Math.random() * w * 0.02;
          ctx.fillRect(ix, sy + h * 0.15 - ih, iw, ih);
        }
        // Price tags
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#333333'; ctx.lineWidth = 1;
        ctx.font = 'bold ' + (h * 0.025) + 'px Arial'; ctx.textAlign = 'center';
        var prices = ['50p', '\u00A31', '\u00A32', '99p', '\u00A31.50', '75p'];
        for (var pt = 0; pt < 2; pt++) {
          var tx = w * (0.25 + pt * 0.4), ty = sy + h * 0.04;
          roundRect(ctx, tx - 18, ty - 8, 36, 16, 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#333333';
          ctx.fillText(prices[shelf * 2 + pt] || '\u00A31', tx, ty + 4);
          ctx.fillStyle = '#FFFFFF';
        }
      }
      // Donation bin at bottom-left
      ctx.fillStyle = '#7744AA';
      roundRect(ctx, w * 0.06, h * 0.78, w * 0.22, h * 0.16, 3); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + (h * 0.028) + 'px Arial';
      ctx.fillText('DONATE', w * 0.17, h * 0.86);
      ctx.fillText('HERE', w * 0.17, h * 0.90);
      // Heart + poster bottom-right
      ctx.fillStyle = '#FFEEEE';
      roundRect(ctx, w * 0.62, h * 0.78, w * 0.32, h * 0.16, 3); ctx.fill();
      ctx.fillStyle = '#FF6699';
      drawHeart(ctx, w * 0.72, h * 0.82, 14);
      ctx.fillStyle = '#7744AA';
      ctx.font = 'italic ' + (h * 0.025) + 'px Georgia';
      ctx.fillText('Every penny', w * 0.78, h * 0.87);
      ctx.fillText('counts', w * 0.78, h * 0.91);

    } else if (style === 'slots') {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0A0020'); grad.addColorStop(0.5, '#150030'); grad.addColorStop(1, '#000008');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Neon border glow (double-stroke for bloom effect)
      ctx.shadowColor = '#FF00FF'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#FF44FF'; ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 12;
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.shadowBlur = 0;
      // Jackpot banner with strong neon glow
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 25;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold ' + (h * 0.09) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText('JACKPOT', w / 2, h * 0.1);
      ctx.shadowColor = '#FF0000'; ctx.shadowBlur = 15;
      ctx.fillStyle = '#FF2200';
      ctx.font = 'bold ' + (h * 0.055) + 'px Arial';
      ctx.fillText('WIN UP TO \u00A310,000!', w / 2, h * 0.19);
      ctx.shadowBlur = 0;
      // Slot machines with neon trim
      for (var m = 0; m < 3; m++) {
        var mx = w * (0.08 + m * 0.32), my = h * 0.25;
        var mw = w * 0.24, mh = h * 0.5;
        var mGrad = ctx.createLinearGradient(mx, my, mx + mw, my);
        mGrad.addColorStop(0, '#333366'); mGrad.addColorStop(0.5, '#444499'); mGrad.addColorStop(1, '#333366');
        ctx.fillStyle = mGrad;
        roundRect(ctx, mx, my, mw, mh, 6); ctx.fill();
        ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        roundRect(ctx, mx, my, mw, mh, 6); ctx.stroke();
        ctx.shadowBlur = 0;
        // Screen with glow
        ctx.fillStyle = '#000011';
        ctx.fillRect(mx + mw*0.10, my + mh*0.06, mw*0.80, mh*0.38);
        // Symbols with neon glow
        var symbols = ['7', '\u2605', '\u2666'];
        var symCols = ['#FF0000', '#FFD700', '#00FF44'];
        ctx.shadowColor = symCols[m]; ctx.shadowBlur = 12;
        ctx.fillStyle = symCols[m];
        ctx.font = 'bold ' + (mh * 0.22) + 'px Arial'; ctx.textAlign = 'center';
        ctx.fillText(symbols[m], mx + mw/2, my + mh*0.32);
        ctx.shadowBlur = 0;
        // Buttons
        ctx.fillStyle = '#FF0000';
        ctx.beginPath(); ctx.arc(mx + mw/2, my + mh*0.58, mw*0.08, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#00CC00';
        ctx.beginPath(); ctx.arc(mx + mw/2, my + mh*0.72, mw*0.07, 0, Math.PI*2); ctx.fill();
      }
      // Neon "OPEN 24/7" strip
      ctx.shadowColor = '#00FF00'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#00FF44';
      ctx.font = 'bold ' + (h * 0.04) + 'px Arial';
      ctx.fillText('OPEN 24/7', w / 2, h * 0.82);
      ctx.shadowBlur = 0;
      // Sparkle stars (more of them)
      ctx.fillStyle = '#FFD700';
      for (var st = 0; st < 16; st++) {
        drawStar(ctx, Math.random() * w, h * 0.78 + Math.random() * h * 0.15, 2 + Math.random() * 6, 5);
      }
      // 18+ badge
      ctx.fillStyle = '#CC0000';
      ctx.beginPath(); ctx.arc(w * 0.88, h * 0.93, h * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + (h * 0.04) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText('18+', w * 0.88, h * 0.945);

    } else if (style === 'empty') {
      // Dark vacant interior
      ctx.fillStyle = '#3A3530';
      ctx.fillRect(0, 0, w, h);
      // Grime gradient from edges
      var grd = ctx.createRadialGradient(w/2, h/2, w*0.15, w/2, h/2, w*0.6);
      grd.addColorStop(0, 'rgba(60,55,50,0.3)');
      grd.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      // Dusty floor line
      ctx.fillStyle = 'rgba(80,70,55,0.4)';
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      // Horizontal board planks across the window
      ctx.fillStyle = '#7A6E58';
      for (var bd = 0; bd < 4; bd++) {
        var by = h * (0.08 + bd * 0.22);
        var bh = h * 0.10;
        ctx.fillRect(0, by, w, bh);
        // Wood grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
        for (var gl = 0; gl < 5; gl++) {
          var gy = by + bh * (0.15 + gl * 0.18);
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy + (Math.random()-0.5)*4); ctx.stroke();
        }
        // Nail heads at ends
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(w * 0.06, by + bh/2, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.94, by + bh/2, 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#7A6E58';
      }
      // Grime streaks running down from boards
      for (var i = 0; i < 12; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random()*0.08).toFixed(3) + ')';
        ctx.fillRect(Math.random()*w, Math.random()*h*0.5, 2+Math.random()*5, h*0.3+Math.random()*h*0.4);
      }
      // TO LET sign (pinned paper, slightly torn)
      ctx.save();
      ctx.translate(w/2, h*0.50);
      ctx.rotate(-0.03);
      ctx.fillStyle = '#EEEADD';
      ctx.fillRect(-w*0.22, -h*0.09, w*0.44, h*0.18);
      // Pin holes at top
      ctx.fillStyle = '#CC0000';
      ctx.beginPath(); ctx.arc(-w*0.18, -h*0.07, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(w*0.18, -h*0.07, 3, 0, Math.PI*2); ctx.fill();
      // Text
      ctx.fillStyle = '#CC0000';
      ctx.font = 'bold ' + (h*0.08) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TO LET', 0, -h*0.01);
      ctx.fillStyle = '#333';
      ctx.font = (h*0.03) + 'px Arial';
      ctx.fillText('0800 555 1234', 0, h*0.06);
      ctx.restore();
      // Heavy dirt overlay
      for (var i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.03 + Math.random()*0.06).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(Math.random()*w, Math.random()*h, 8+Math.random()*30, 0, Math.PI*2);
        ctx.fill();
      }
    }
    return c;
  }

  // Create door texture canvas for each shop
  function makeDoorCanvas(shop) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    var ctx = c.getContext('2d');
    var w = 256, h = 512;

    if (shop.style === 'fastfood') {
      // Red door with glass upper
      ctx.fillStyle = '#AA0000';
      ctx.fillRect(0, 0, w, h);
      // Frame border
      ctx.strokeStyle = '#880000'; ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      // Glass panel (upper 60%)
      ctx.fillStyle = '#88BBDD';
      roundRect(ctx, 18, 18, w - 36, h * 0.55, 4); ctx.fill();
      ctx.strokeStyle = '#660000'; ctx.lineWidth = 3;
      roundRect(ctx, 18, 18, w - 36, h * 0.55, 4); ctx.stroke();
      // Golden M on glass
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('M', w / 2, h * 0.22);
      // PUSH bar
      ctx.fillStyle = '#CCCCCC';
      roundRect(ctx, w * 0.15, h * 0.65, w * 0.7, h * 0.06, 3); ctx.fill();
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('PUSH', w / 2, h * 0.685);
      // Opening hours
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px Arial';
      ctx.fillText('OPEN 6AM - 11PM', w / 2, h * 0.82);
      // Handle
      ctx.fillStyle = '#C0C0C0';
      ctx.fillRect(w * 0.75, h * 0.62, w * 0.06, h * 0.12);

    } else if (shop.style === 'charity') {
      // Friendly purple door
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#6633AA'); grad.addColorStop(1, '#442277');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Frame
      ctx.strokeStyle = '#331166'; ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      // Glass panel upper
      ctx.fillStyle = '#99AACC';
      roundRect(ctx, 18, 18, w - 36, h * 0.45, 4); ctx.fill();
      ctx.strokeStyle = '#442277'; ctx.lineWidth = 3;
      roundRect(ctx, 18, 18, w - 36, h * 0.45, 4); ctx.stroke();
      // "OPEN" sign in window
      ctx.fillStyle = '#00AA00';
      roundRect(ctx, w * 0.2, h * 0.12, w * 0.6, h * 0.08, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OPEN', w / 2, h * 0.165);
      // Heart on glass
      ctx.fillStyle = '#FF6699';
      drawHeart(ctx, w / 2, h * 0.28, 28);
      // "Please Come In" text
      ctx.fillStyle = '#F0E0C0';
      ctx.font = 'italic 16px Georgia';
      ctx.fillText('Please Come In', w / 2, h * 0.55);
      // Lower panels (2 recessed panels)
      ctx.fillStyle = '#553399';
      roundRect(ctx, 22, h * 0.6, w / 2 - 32, h * 0.34, 3); ctx.fill();
      roundRect(ctx, w / 2 + 10, h * 0.6, w / 2 - 32, h * 0.34, 3); ctx.fill();
      ctx.strokeStyle = '#442288'; ctx.lineWidth = 2;
      roundRect(ctx, 22, h * 0.6, w / 2 - 32, h * 0.34, 3); ctx.stroke();
      roundRect(ctx, w / 2 + 10, h * 0.6, w / 2 - 32, h * 0.34, 3); ctx.stroke();
      // Handle
      ctx.fillStyle = '#C8A832';
      ctx.beginPath(); ctx.arc(w * 0.8, h * 0.68, 8, 0, Math.PI * 2); ctx.fill();

    } else if (shop.style === 'slots') {
      // Dark imposing door
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#111122'); grad.addColorStop(1, '#000008');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Gold border
      ctx.strokeStyle = '#B8960C'; ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      // Tinted glass panel
      ctx.fillStyle = '#222244';
      roundRect(ctx, 20, 20, w - 40, h * 0.4, 4); ctx.fill();
      ctx.strokeStyle = '#B8960C'; ctx.lineWidth = 2;
      roundRect(ctx, 20, 20, w - 40, h * 0.4, 4); ctx.stroke();
      // "LUCKY SPINS" on glass
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LUCKY', w / 2, h * 0.12);
      ctx.fillText('SPINS', w / 2, h * 0.19);
      ctx.shadowBlur = 0;
      // Stars
      ctx.fillStyle = '#FFD700';
      drawStar(ctx, 40, h * 0.28, 8, 5);
      drawStar(ctx, w - 40, h * 0.28, 8, 5);
      // 18+ warning circle
      ctx.fillStyle = '#CC0000';
      ctx.beginPath(); ctx.arc(w / 2, h * 0.35, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('18+', w / 2, h * 0.355);
      // Lower panels
      ctx.fillStyle = '#0A0A1A';
      roundRect(ctx, 22, h * 0.52, w - 44, h * 0.16, 3); ctx.fill();
      roundRect(ctx, 22, h * 0.72, w - 44, h * 0.22, 3); ctx.fill();
      ctx.strokeStyle = '#554400'; ctx.lineWidth = 1;
      roundRect(ctx, 22, h * 0.52, w - 44, h * 0.16, 3); ctx.stroke();
      roundRect(ctx, 22, h * 0.72, w - 44, h * 0.22, 3); ctx.stroke();
      // "OPEN" on lower panel
      ctx.fillStyle = '#FF4400';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('OPEN', w / 2, h * 0.605);
      // Gold handle
      ctx.fillStyle = '#B8960C';
      ctx.fillRect(w * 0.76, h * 0.56, 10, h * 0.08);

    } else if (shop.style === 'empty') {
      // Weathered, boarded door
      ctx.fillStyle = '#8A8070';
      ctx.fillRect(0, 0, w, h);
      // Wood grain plank lines
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (var i = 0; i < w; i += 18) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      }
      // Dirt/stains
      for (var i = 0; i < 10; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.03 + Math.random() * 0.06).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 25, 0, Math.PI * 2);
        ctx.fill();
      }
      // Faded paint
      ctx.fillStyle = 'rgba(60,80,60,0.08)';
      ctx.fillRect(0, 0, w, h);
      // Padlock hasp
      ctx.fillStyle = '#555555';
      ctx.fillRect(w * 0.42, h * 0.48, w * 0.16, h * 0.02);
      // Padlock body
      ctx.fillStyle = '#888866';
      roundRect(ctx, w * 0.44, h * 0.50, w * 0.12, h * 0.06, 2); ctx.fill();
      // Padlock shackle
      ctx.strokeStyle = '#777766'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.50, w * 0.04, Math.PI, 0);
      ctx.stroke();
      // "CLOSED" notice (taped paper)
      ctx.fillStyle = '#EEEEDD';
      ctx.save(); ctx.translate(w / 2, h * 0.28); ctx.rotate(-0.05);
      ctx.fillRect(-50, -22, 100, 44);
      ctx.fillStyle = '#CC0000';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CLOSED', 0, 0);
      ctx.restore();
      // Tape strips
      ctx.fillStyle = 'rgba(200,180,120,0.5)';
      ctx.save(); ctx.translate(w / 2 - 40, h * 0.26); ctx.rotate(-0.4);
      ctx.fillRect(-15, -3, 30, 6); ctx.restore();
      ctx.save(); ctx.translate(w / 2 + 40, h * 0.26); ctx.rotate(0.4);
      ctx.fillRect(-15, -3, 30, 6); ctx.restore();
      // Letterbox
      ctx.fillStyle = '#555555';
      ctx.fillRect(w * 0.3, h * 0.72, w * 0.4, h * 0.02);

    } else {
      // Default Victorian panelled door
      var col = shop.color || 0x2A1810;
      var rc = (col >> 16) & 0xFF, gc = (col >> 8) & 0xFF, bc = col & 0xFF;
      // Darken shop color for the door
      var dr = Math.max(0, Math.floor(rc * 0.4));
      var dg = Math.max(0, Math.floor(gc * 0.4));
      var db = Math.max(0, Math.floor(bc * 0.4));
      ctx.fillStyle = 'rgb(' + dr + ',' + dg + ',' + db + ')';
      ctx.fillRect(0, 0, w, h);
      // Frame border
      var lr = Math.min(255, dr + 30), lg = Math.min(255, dg + 30), lb = Math.min(255, db + 30);
      ctx.strokeStyle = 'rgb(' + lr + ',' + lg + ',' + lb + ')';
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      // Glass panel (upper section)
      ctx.fillStyle = '#8899AA';
      roundRect(ctx, 18, 18, w - 36, h * 0.4, 4); ctx.fill();
      ctx.strokeStyle = 'rgb(' + lr + ',' + lg + ',' + lb + ')';
      ctx.lineWidth = 3;
      roundRect(ctx, 18, 18, w - 36, h * 0.4, 4); ctx.stroke();
      // Glazing bar (cross)
      ctx.fillStyle = 'rgb(' + lr + ',' + lg + ',' + lb + ')';
      ctx.fillRect(w / 2 - 2, 18, 4, h * 0.4);
      ctx.fillRect(18, h * 0.2 - 2, w - 36, 4);
      // Two lower panels
      var panelC = 'rgb(' + Math.min(255, dr + 15) + ',' + Math.min(255, dg + 15) + ',' + Math.min(255, db + 15) + ')';
      ctx.fillStyle = panelC;
      roundRect(ctx, 22, h * 0.52, w / 2 - 32, h * 0.4, 3); ctx.fill();
      roundRect(ctx, w / 2 + 10, h * 0.52, w / 2 - 32, h * 0.4, 3); ctx.fill();
      ctx.strokeStyle = 'rgb(' + lr + ',' + lg + ',' + lb + ')';
      ctx.lineWidth = 2;
      roundRect(ctx, 22, h * 0.52, w / 2 - 32, h * 0.4, 3); ctx.stroke();
      roundRect(ctx, w / 2 + 10, h * 0.52, w / 2 - 32, h * 0.4, 3); ctx.stroke();
      // Brass handle
      ctx.fillStyle = '#C8A832';
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#A08828';
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.6, 4, 0, Math.PI * 2); ctx.fill();
      // Letterbox
      ctx.fillStyle = '#C8A832';
      roundRect(ctx, w * 0.28, h * 0.48, w * 0.44, h * 0.025, 2); ctx.fill();
    }
    return c;
  }

  // -------------------------------------------------------
  // SHOP FRONTS — Late-Victorian commercial streetscape
  // Plate glass windows, stall risers, mullions, transom
  // lights, pilasters, fascia boards, continuous cornice
  // -------------------------------------------------------
  function buildShopFronts(scene) {
    var group = new THREE.Group();
    var shops = XJ.SHOPFRONTS;
    if (!shops || shops.length === 0) return group;

    var frameMerger = new GeoMerger();     // cast-iron frames & mullions
    var glassMerger = new GeoMerger();     // glass panes
    var stallMerger = new GeoMerger();     // stall risers below windows
    var pilasterMerger = new GeoMerger();  // pilasters between shop units
    var corniceMerger = new GeoMerger();   // cornice moulding

    // Victorian shopfront proportions
    var stallH = 0.45;          // stall riser height
    var winBot = stallH;        // bottom of display window
    var winTop = 2.4;           // top of display window
    var mainWinH = winTop - winBot;  // ~1.95m plate glass
    var transomH = 0.3;        // transom light height
    var transomTop = winTop + transomH + 0.05; // ~2.75m
    var fasciaTop = 3.0;       // top of fascia/sign board
    var fw = 0.06;             // frame strip width (deeper for #6 street depth)
    var mullionW = 0.04;       // mullion bar width
    var pilW = 0.16;           // pilaster width
    var pilD = 0.14;           // pilaster protrusion (deeper for #6 street depth)

    // Track terrace extents for continuous cornice
    var northMinX = Infinity, northMaxX = -Infinity, northZ = 0;
    var southMinX = Infinity, southMaxX = -Infinity, southZ = 0;

    for (var si = 0; si < shops.length; si++) {
      var s = shops[si];
      var facingS = (s.face === 's');
      var faceZ = facingS ? s.z + 0.02 : s.z - 0.02;
      var faceDir = facingS ? 1 : -1;
      var fOff = faceDir * 0.05;
      var cx = s.x + s.w / 2;

      // Track extents
      if (facingS) {
        if (s.x < northMinX) northMinX = s.x;
        if (s.x + s.w > northMaxX) northMaxX = s.x + s.w;
        northZ = s.z;
      } else {
        if (s.x < southMinX) southMinX = s.x;
        if (s.x + s.w > southMaxX) southMaxX = s.x + s.w;
        southZ = s.z;
      }

      // --- Stall riser (solid panel below window — tiled/panelled look) ---
      stallMerger.addBox(cx, stallH / 2, faceZ + fOff, s.w - pilW * 2 - 0.1, stallH, 0.10);

      // --- Recessed door (right side of each unit) ---
      var doorW = 0.85;
      var doorH = 2.3;
      var doorRecess = 0.18;
      var doorX = s.x + s.w - pilW - doorW / 2 - 0.15;
      var doorFOff = faceDir * (0.05 - doorRecess);

      // Door panel (base box)
      frameMerger.addBox(doorX, doorH / 2, faceZ + doorFOff, doorW, doorH, 0.04);
      // Textured door face
      var doorCanvas = makeDoorCanvas(s);
      var doorTex = new THREE.CanvasTexture(doorCanvas);
      var doorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(doorW - 0.02, doorH - 0.02),
        new THREE.MeshLambertMaterial({ map: doorTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      );
      doorMesh.position.set(doorX, doorH / 2, faceZ + doorFOff + faceDir * 0.025);
      doorMesh.rotation.y = facingS ? 0 : Math.PI;
      group.add(doorMesh);
      // Door glass (upper two-thirds) — skip for boarded-up stores
      if (s.style !== 'empty') {
        glassMerger.addPlane(doorX, doorH * 0.62, faceZ + doorFOff + faceDir * 0.01,
          doorW - 0.12, doorH * 0.48, 0, facingS ? 0 : Math.PI);
      }
      // Fanlight above door (arched transom)
      var fanlightH = transomTop - doorH - fw * 2;
      if (fanlightH > 0.08) {
        glassMerger.addPlane(doorX, doorH + fw + fanlightH / 2, faceZ + fOff,
          doorW - 0.06, fanlightH, 0, facingS ? 0 : Math.PI);
      }
      // Door surround (continuous frame from ground to transom top)
      var surH = transomTop;
      frameMerger.addBox(doorX - doorW / 2 - fw / 2, surH / 2, faceZ + fOff, fw, surH, fw);
      frameMerger.addBox(doorX + doorW / 2 + fw / 2, surH / 2, faceZ + fOff, fw, surH, fw);
      frameMerger.addBox(doorX, transomTop + fw / 2, faceZ + fOff, doorW + fw * 2, fw, fw);

      // --- Main display window (plate glass, left of door) ---
      var winLeft = s.x + pilW + 0.05;
      var winRight = doorX - doorW / 2 - fw - 0.1;
      var winW = winRight - winLeft;
      var winCX = (winLeft + winRight) / 2;

      if (winW > 0.5) {
        var winCY = winBot + mainWinH / 2;
        var tCY = winTop + fw + transomH / 2;

        if (s.style === 'empty') {
          // Boarded/whitewashed — no glass panes, no mullions
        } else {
          // Glass panes (plate glass + transom)
          glassMerger.addPlane(winCX, winCY, faceZ + fOff, winW, mainWinH, 0, facingS ? 0 : Math.PI);
          glassMerger.addPlane(winCX, tCY, faceZ + fOff, winW, transomH, 0, facingS ? 0 : Math.PI);

          // Mullions (vertical glazing bars, ~1.2m spacing)
          var nMullions = Math.max(0, Math.floor(winW / 1.2) - 1);
          if (nMullions > 0) {
            var mStep = winW / (nMullions + 1);
            for (var m = 1; m <= nMullions; m++) {
              var mx = winLeft + m * mStep;
              frameMerger.addBox(mx, winCY, faceZ + fOff, mullionW, mainWinH, fw);
              frameMerger.addBox(mx, tCY, faceZ + fOff, mullionW, transomH, fw);
            }
          }
        }

        // Transom bar
        frameMerger.addBox(winCX, winTop + fw / 2, faceZ + fOff, winW + fw, fw, fw);
        // Window surround frame
        frameMerger.addBox(winCX, winBot - fw / 2, faceZ + fOff, winW + fw * 2, fw, fw);
        frameMerger.addBox(winCX, transomTop + fw / 2, faceZ + fOff, winW + fw * 2, fw, fw);
        frameMerger.addBox(winLeft - fw / 2, (winBot + transomTop) / 2, faceZ + fOff, fw, transomTop - winBot + fw, fw);
        frameMerger.addBox(winRight + fw / 2, (winBot + transomTop) / 2, faceZ + fOff, fw, transomTop - winBot + fw, fw);

        // Window display panel (for styled shops)
        if (s.style) {
          var dispCanvas = makeWindowDisplayCanvas(s.style);
          var dispTex = new THREE.CanvasTexture(dispCanvas);
          var dispH = mainWinH + transomH + fw;
          var dispY = winBot + dispH / 2;
          var dispOff = s.style === 'empty' ? fOff : fOff - faceDir * 0.03;
          var dispMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(winW - 0.02, dispH),
            new THREE.MeshLambertMaterial({ map: dispTex, side: THREE.DoubleSide })
          );
          dispMesh.position.set(winCX, dispY, faceZ + dispOff);
          dispMesh.rotation.y = facingS ? 0 : Math.PI;
          group.add(dispMesh);
        }
      }

      // --- Pilasters (at shop boundaries, full height to fascia) ---
      var pilH = fasciaTop;
      var pilCY = pilH / 2;
      pilasterMerger.addBox(s.x + pilW / 2, pilCY, faceZ + faceDir * (pilD / 2), pilW, pilH, pilD);
      // Right pilaster — skip if flush with next shop (avoid doubles)
      var hasNeighbour = false;
      for (var nsi = 0; nsi < shops.length; nsi++) {
        if (nsi !== si && shops[nsi].face === s.face && Math.abs(shops[nsi].x - (s.x + s.w)) < 0.5) {
          hasNeighbour = true; break;
        }
      }
      if (!hasNeighbour) {
        pilasterMerger.addBox(s.x + s.w - pilW / 2, pilCY, faceZ + faceDir * (pilD / 2), pilW, pilH, pilD);
      }

      // --- Fascia / sign board (between transom top and cornice) ---
      var signCanvas = makeShopSignCanvas(s);
      var signTex = new THREE.CanvasTexture(signCanvas);
      var fasciaH = fasciaTop - transomTop - 0.05;
      var fasciaY = transomTop + fasciaH / 2 + 0.025;
      var signW = s.w - pilW * 2 - 0.1;
      // Dark backplate behind sign for contrast
      var backplateMesh = new THREE.Mesh(
        new THREE.BoxGeometry(signW + 0.06, fasciaH + 0.06, 0.04),
        mat(0x1A1410)
      );
      backplateMesh.position.set(cx, fasciaY, faceZ + faceDir * 0.06);
      group.add(backplateMesh);
      // Sign face with subtle emissive glow
      var signEmissive = (s.style === 'slots') ? 0.5 : (s.style === 'empty' ? 0.0 : 0.15);
      var signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(signW, fasciaH),
        new THREE.MeshLambertMaterial({ map: signTex, emissive: 0xFFFFFF, emissiveMap: signTex, emissiveIntensity: signEmissive })
      );
      signMesh.position.set(cx, fasciaY, faceZ + faceDir * 0.09);
      signMesh.rotation.y = facingS ? 0 : Math.PI;
      group.add(signMesh);

    }

    // --- Continuous cornice moulding (runs full width of each terrace) ---
    // North side cornice spans full terrace including jewellery shop gap
    if (northMaxX > northMinX) {
      var nfz = northZ + 0.02;
      var cLen = northMaxX - northMinX;
      var cCX = (northMinX + northMaxX) / 2;
      // Main cornice ledge
      corniceMerger.addBox(cCX, fasciaTop + 0.06, nfz + 0.08, cLen + 0.3, 0.12, 0.18);
      // Smaller lip above
      corniceMerger.addBox(cCX, fasciaTop + 0.15, nfz + 0.06, cLen + 0.2, 0.06, 0.12);
    }
    // South side cornice
    if (southMaxX > southMinX) {
      var sfz = southZ - 0.02;
      var cLen = southMaxX - southMinX;
      var cCX = (southMinX + southMaxX) / 2;
      corniceMerger.addBox(cCX, fasciaTop + 0.06, sfz - 0.08, cLen + 0.3, 0.12, 0.18);
      corniceMerger.addBox(cCX, fasciaTop + 0.15, sfz - 0.06, cLen + 0.2, 0.06, 0.12);
    }

    // --- Build merged meshes ---
    var frameMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A }); // cast-iron black
    var frameMesh = frameMerger.toMesh(frameMat, { castShadow: true });
    if (frameMesh) group.add(frameMesh);

    var glassMat = new THREE.MeshLambertMaterial({
      color: 0x88AACC, transparent: true, opacity: 0.3, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    var glassMesh = glassMerger.toMesh(glassMat);
    if (glassMesh) group.add(glassMesh);

    var stallMat = new THREE.MeshLambertMaterial({ color: 0x665544 }); // dark wood/tile
    var stallMesh = stallMerger.toMesh(stallMat, { castShadow: true });
    if (stallMesh) group.add(stallMesh);

    var pilasterMat = new THREE.MeshLambertMaterial({ color: 0xB8A878, map: brickTex }); // London stock buff brick
    var pilasterMesh = pilasterMerger.toMesh(pilasterMat, { castShadow: true });
    if (pilasterMesh) applyWorldUVs(pilasterMesh.geometry, 2.0);
    if (pilasterMesh) group.add(pilasterMesh);

    var corniceMat = new THREE.MeshLambertMaterial({ color: 0xB8B0A0 }); // stone
    var corniceMesh = corniceMerger.toMesh(corniceMat, { castShadow: true });
    if (corniceMesh) group.add(corniceMesh);

    scene.add(group);
    return group;
  }

  // -------------------------------------------------------
  // SHOP INTERIOR — Premium showroom + suspended ceiling grid
  // Single-mesh merging for performance. Emissive panels
  // replace real point lights. 2D impostors for back rooms.
  // -------------------------------------------------------
  function buildShopFurniture(scene) {
    var group = new THREE.Group();
    var shop = XJ.SHOP;
    var thick = shop.wallThick;

    // --- Merged geometry buckets ---
    var gridMerger = new GeoMerger();      // ceiling grid rails (metal)
    var tileMerger = new GeoMerger();      // blank ceiling tiles
    var lightMerger = new GeoMerger();     // emissive light panels
    var skirtMerger = new GeoMerger();     // skirting boards
    var archMerger = new GeoMerger();      // architraves
    var threshMerger = new GeoMerger();    // floor threshold strips
    var grimeMerger = new GeoMerger();     // floor-wall grime strips
    var glassIntMerger = new GeoMerger();  // interior window glass

    // =========================================================
    // 1. EXTERIOR FASCIA SIGN (kept from original)
    // =========================================================
    var fasciaH = 0.25;
    var fasciaY = 2.75 + fasciaH / 2;
    var fasciaW = shop.maxX - shop.minX - 0.6;
    var signCanvas = document.createElement('canvas');
    signCanvas.width = 512; signCanvas.height = 80;
    var sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#2A1810';
    sctx.fillRect(0, 0, 512, 80);
    sctx.fillStyle = '#DAA520';
    sctx.font = 'bold 38px Georgia';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText('Xclusive Jewellers', 256, 42);
    var signTex = new THREE.CanvasTexture(signCanvas);
    var signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fasciaW, fasciaH),
      new THREE.MeshLambertMaterial({ map: signTex, emissive: 0xFFFFFF, emissiveMap: signTex, emissiveIntensity: 0.2,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    );
    signMesh.position.set((shop.minX + shop.maxX) / 2, fasciaY, shop.maxZ + thick / 2 + 0.08);
    group.add(signMesh);

    // =========================================================
    // 2. SUSPENDED CEILING GRID (all rooms)
    // =========================================================
    var ceilY = shop.wallHeight;       // flush with wall tops
    var panelDrop = 0.04;              // panels hang 4cm below grid rail
    var panelY = ceilY - panelDrop;    // panel face looking down
    var gridW = 0.02;                  // grid rail width
    var gridH = 0.05;                  // grid rail height (visible edge)
    var tileSize = 0.6;               // 60×60cm panels

    for (var ri = 0; ri < shop.rooms.length; ri++) {
      var room = shop.rooms[ri];
      var rx1 = room.minX, rz1 = room.minZ;
      var rx2 = room.maxX, rz2 = room.maxZ;
      var rw = rx2 - rx1, rd = rz2 - rz1;
      var isShowroom = (room.id === 'showroom');

      // Panel counts
      var nx = Math.floor(rw / tileSize);
      var nz = Math.floor(rd / tileSize);
      // Centre the grid within the room
      var padX = (rw - nx * tileSize) / 2;
      var padZ = (rd - nz * tileSize) / 2;

      // Grid rails — horizontal (x-direction) and depth (z-direction)
      for (var gz = 0; gz <= nz; gz++) {
        var railZ = rz1 + padZ + gz * tileSize;
        gridMerger.addBox(rx1 + rw/2, ceilY - gridH/2, railZ, rw, gridH, gridW);
      }
      for (var gx = 0; gx <= nx; gx++) {
        var railX = rx1 + padX + gx * tileSize;
        gridMerger.addBox(railX, ceilY - gridH/2, rz1 + rd/2, gridW, gridH, rd);
      }

      // Panels — fill each cell
      var lightCounter = 0;
      var lightInterval = isShowroom ? 2 : 3;  // showroom: every 2nd, back rooms: every 3rd
      for (var pz = 0; pz < nz; pz++) {
        for (var px = 0; px < nx; px++) {
          var cx = rx1 + padX + (px + 0.5) * tileSize;
          var cz = rz1 + padZ + (pz + 0.5) * tileSize;
          var ps = tileSize - gridW - 0.01;  // panel slightly smaller than cell

          var isLight = (lightCounter % (lightInterval + 1) === 0);
          if (isLight) {
            lightMerger.addPlane(cx, panelY, cz, ps, ps, Math.PI/2, 0);
          } else {
            tileMerger.addPlane(cx, panelY, cz, ps, ps, Math.PI/2, 0);
          }
          lightCounter++;
        }
      }

      // Edge fill — close gap between grid edge and walls
      // North/South edge strips
      if (padZ > 0.02) {
        tileMerger.addPlane(rx1 + rw/2, panelY, rz1 + padZ/2, rw, padZ - gridW, Math.PI/2, 0);
        tileMerger.addPlane(rx1 + rw/2, panelY, rz2 - padZ/2, rw, padZ - gridW, Math.PI/2, 0);
      }
      // East/West edge strips
      if (padX > 0.02) {
        tileMerger.addPlane(rx1 + padX/2, panelY, rz1 + rd/2, padX - gridW, rd, Math.PI/2, 0);
        tileMerger.addPlane(rx2 - padX/2, panelY, rz1 + rd/2, padX - gridW, rd, Math.PI/2, 0);
      }
    }

    // =========================================================
    // 3. SKIRTING BOARDS (along all interior wall bases)
    // =========================================================
    var skH = 0.08, skD = 0.015;  // 8cm tall, 1.5cm deep

    // Helper: add skirting along a wall segment, skipping door gaps
    function addSkirting(x1, z1, x2, z2, face, doors) {
      var isH = (Math.abs(z1 - z2) < 0.01);
      if (isH) {
        var z = z1;
        var left = Math.min(x1, x2), right = Math.max(x1, x2);
        var segs = splitSkirtSegments(left, right, doors, 'h');
        for (var i = 0; i < segs.length; i++) {
          var sw = segs[i].end - segs[i].start;
          var sx = segs[i].start + sw / 2;
          skirtMerger.addBox(sx, skH/2, z + face * skD/2, sw, skH, skD);
        }
      } else {
        var x = x1;
        var top = Math.min(z1, z2), bot = Math.max(z1, z2);
        var segs = splitSkirtSegments(top, bot, doors, 'v');
        for (var i = 0; i < segs.length; i++) {
          var sd = segs[i].end - segs[i].start;
          var sz = segs[i].start + sd / 2;
          skirtMerger.addBox(x + face * skD/2, skH/2, sz, skD, skH, sd);
        }
      }
    }

    function splitSkirtSegments(start, end, doors, orient) {
      var gaps = [];
      for (var i = 0; i < doors.length; i++) {
        var d = doors[i];
        if (d.type === 'win') continue;
        if (orient === 'h' && d.orient === 'h') {
          gaps.push({ start: d.x - d.w/2 - 0.05, end: d.x + d.w/2 + 0.05 });
        } else if (orient === 'v' && d.orient === 'v') {
          gaps.push({ start: d.z - d.w/2 - 0.05, end: d.z + d.w/2 + 0.05 });
        }
      }
      gaps.sort(function(a, b) { return a.start - b.start; });
      var segs = [], cursor = start;
      for (var i = 0; i < gaps.length; i++) {
        if (gaps[i].start > cursor) segs.push({ start: cursor, end: gaps[i].start });
        cursor = Math.max(cursor, gaps[i].end);
      }
      if (cursor < end) segs.push({ start: cursor, end: end });
      return segs;
    }

    // Showroom walls
    var sr = shop.rooms[0]; // showroom
    addSkirting(sr.minX, sr.maxZ, sr.maxX, sr.maxZ, -1, shop.doors); // south (entrance wall)
    addSkirting(sr.minX, sr.minZ, sr.maxX, sr.minZ, 1, shop.doors);  // north (interior divider)
    addSkirting(sr.minX, sr.minZ, sr.minX, sr.maxZ, 1, []);          // west
    addSkirting(sr.maxX, sr.minZ, sr.maxX, sr.maxZ, -1, []);         // east
    // Workshop walls
    var ws = shop.rooms[1];
    addSkirting(ws.minX, ws.maxZ, ws.maxX, ws.maxZ, -1, shop.doors); // south
    addSkirting(ws.minX, ws.minZ, ws.maxX, ws.minZ, 1, []);          // north (ext wall)
    addSkirting(ws.minX, ws.minZ, ws.minX, ws.maxZ, 1, []);          // west (ext wall)
    addSkirting(ws.maxX, ws.minZ, ws.maxX, ws.maxZ, -1, shop.doors); // east (to kitchen)
    // Kitchen walls
    var kt = shop.rooms[2];
    addSkirting(kt.minX, kt.minZ, kt.maxX, kt.minZ, 1, []);
    addSkirting(kt.minX, kt.minZ, kt.minX, kt.maxZ, 1, shop.doors);
    addSkirting(kt.maxX, kt.minZ, kt.maxX, kt.maxZ, -1, shop.doors);
    // Toilet walls
    var tl = shop.rooms[3];
    addSkirting(tl.minX, tl.minZ, tl.maxX, tl.minZ, 1, []);
    addSkirting(tl.maxX, tl.minZ, tl.maxX, tl.maxZ, -1, []);
    addSkirting(tl.minX, tl.minZ, tl.minX, tl.maxZ, 1, shop.doors);

    // =========================================================
    // 4. ARCHITRAVES (around door frames)
    // =========================================================
    var archW = 0.05, archD = 0.02;
    var doorH = 2.2;
    for (var di = 0; di < shop.doors.length; di++) {
      var d = shop.doors[di];
      if (d.type === 'win') continue;
      var hw = d.w / 2;
      if (d.orient === 'h') {
        // Architrave on both faces of horizontal wall
        for (var face = -1; face <= 1; face += 2) {
          var az = d.z + face * (thick/2 + archD/2);
          archMerger.addBox(d.x - hw - archW/2, doorH/2, az, archW, doorH, archD);
          archMerger.addBox(d.x + hw + archW/2, doorH/2, az, archW, doorH, archD);
          archMerger.addBox(d.x, doorH + archW/2, az, d.w + archW*2, archW, archD);
        }
      } else {
        for (var face = -1; face <= 1; face += 2) {
          var ax = d.x + face * (thick/2 + archD/2);
          archMerger.addBox(ax, doorH/2, d.z - hw - archW/2, archD, doorH, archW);
          archMerger.addBox(ax, doorH/2, d.z + hw + archW/2, archD, doorH, archW);
          archMerger.addBox(ax, doorH + archW/2, d.z, archD, archW, d.w + archW*2);
        }
      }
    }

    // =========================================================
    // 5. FLOOR THRESHOLD STRIPS (at doorways)
    // =========================================================
    for (var di = 0; di < shop.doors.length; di++) {
      var d = shop.doors[di];
      if (d.type === 'win') continue;
      if (d.orient === 'h') {
        threshMerger.addBox(d.x, 0.06, d.z, d.w, 0.005, 0.04);
      } else {
        threshMerger.addBox(d.x, 0.06, d.z, 0.04, 0.005, d.w);
      }
    }

    // =========================================================
    // 6. INTERIOR GRIME (very subtle dark strips at floor-wall junctions)
    // =========================================================
    var grimeW = 0.08;
    for (var ri = 0; ri < shop.rooms.length; ri++) {
      var room = shop.rooms[ri];
      var rw = room.maxX - room.minX, rd = room.maxZ - room.minZ;
      // North wall base
      grimeMerger.addPlane(room.minX + rw/2, 0.06, room.minZ + grimeW/2, rw, grimeW, -Math.PI/2, 0);
      // South wall base
      grimeMerger.addPlane(room.minX + rw/2, 0.06, room.maxZ - grimeW/2, rw, grimeW, -Math.PI/2, 0);
      // West wall base
      grimeMerger.addPlane(room.minX + grimeW/2, 0.06, room.minZ + rd/2, grimeW, rd, -Math.PI/2, 0);
      // East wall base
      grimeMerger.addPlane(room.maxX - grimeW/2, 0.06, room.minZ + rd/2, grimeW, rd, -Math.PI/2, 0);
    }

    // =========================================================
    // 7. INTERIOR WINDOW GLASS (showroom display windows, inside face)
    // =========================================================
    var glassY = (0.45 + 2.4) / 2;  // centred between stall riser top and window top
    var glassH = 2.4 - 0.45;
    var glassZ = shop.maxZ - 0.02;   // just inside the south wall
    // Left bay
    glassIntMerger.addPlane(75.65, glassY, glassZ, 2.5, glassH, 0, Math.PI);
    // Right bay
    glassIntMerger.addPlane(80.35, glassY, glassZ, 2.5, glassH, 0, Math.PI);

    // =========================================================
    // 8. 2D IMPOSTOR INTERIORS (back rooms: blurred texture planes)
    // =========================================================
    // Workshop impostor (against north wall, facing south)
    var wsRoom = shop.rooms[1];
    var wsCanvas = makeRoomImpostorCanvas('workshop');
    var wsTex = new THREE.CanvasTexture(wsCanvas);
    var wsMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wsRoom.maxX - wsRoom.minX - 0.1, shop.wallHeight - 0.1),
      new THREE.MeshLambertMaterial({ map: wsTex, side: THREE.DoubleSide })
    );
    wsMesh.position.set((wsRoom.minX + wsRoom.maxX)/2, shop.wallHeight/2, wsRoom.minZ + 0.06);
    group.add(wsMesh);

    // Kitchen impostor (against north wall)
    var ktRoom = shop.rooms[2];
    var ktCanvas = makeRoomImpostorCanvas('kitchen');
    var ktTex = new THREE.CanvasTexture(ktCanvas);
    var ktMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ktRoom.maxX - ktRoom.minX - 0.1, shop.wallHeight - 0.1),
      new THREE.MeshLambertMaterial({ map: ktTex, side: THREE.DoubleSide })
    );
    ktMesh.position.set((ktRoom.minX + ktRoom.maxX)/2, shop.wallHeight/2, ktRoom.minZ + 0.06);
    group.add(ktMesh);

    // Toilet impostor (against east wall, facing west)
    var tlRoom = shop.rooms[3];
    var tlCanvas = makeRoomImpostorCanvas('toilet');
    var tlTex = new THREE.CanvasTexture(tlCanvas);
    var tlMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(tlRoom.maxZ - tlRoom.minZ - 0.1, shop.wallHeight - 0.1),
      new THREE.MeshLambertMaterial({ map: tlTex, side: THREE.DoubleSide })
    );
    tlMesh.position.set(tlRoom.maxX - 0.06, shop.wallHeight/2, (tlRoom.minZ + tlRoom.maxZ)/2);
    tlMesh.rotation.y = -Math.PI/2;
    group.add(tlMesh);

    // =========================================================
    // BUILD MERGED MESHES
    // =========================================================

    // Ceiling grid rails (light grey metal)
    var gridMat = new THREE.MeshLambertMaterial({ color: 0xD0D0D0 });
    var gridMesh = gridMerger.toMesh(gridMat);
    if (gridMesh) group.add(gridMesh);

    // Blank ceiling tiles (off-white with subtle texture)
    var tileMat = new THREE.MeshLambertMaterial({ color: 0xF5F3F0, map: ceilingTileTex });
    var tileMesh = tileMerger.toMesh(tileMat);
    if (tileMesh) group.add(tileMesh);

    // Light panels (emissive soft glow)
    var lightMat = new THREE.MeshLambertMaterial({
      color: 0xFFFFF0, emissive: 0xFFFFF0, emissiveIntensity: 0.7
    });
    var lightMesh = lightMerger.toMesh(lightMat);
    if (lightMesh) group.add(lightMesh);

    // Skirting boards (painted wood, slightly darker than walls)
    var skirtMat = new THREE.MeshLambertMaterial({ color: 0xE0DDD5 });
    var skirtMesh = skirtMerger.toMesh(skirtMat, { receiveShadow: true });
    if (skirtMesh) group.add(skirtMesh);

    // Architraves (matching skirting)
    var archMat = new THREE.MeshLambertMaterial({ color: 0xE0DDD5 });
    var archMesh = archMerger.toMesh(archMat);
    if (archMesh) group.add(archMesh);

    // Floor threshold strips (brushed metal)
    var threshMat = new THREE.MeshLambertMaterial({ color: 0xAAAAAA });
    var threshMesh = threshMerger.toMesh(threshMat);
    if (threshMesh) group.add(threshMesh);

    // Interior grime (very subtle dark overlay)
    var grimeMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.06,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    var grimeMesh = grimeMerger.toMesh(grimeMat);
    if (grimeMesh) group.add(grimeMesh);

    // Interior window glass (slight reflection/fresnel look)
    var glassIntMat = new THREE.MeshLambertMaterial({
      color: 0xCCDDEE, transparent: true, opacity: 0.12,
      depthWrite: false, side: THREE.DoubleSide,
      emissive: 0x8899AA, emissiveIntensity: 0.08,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
    });
    var glassIntMesh = glassIntMerger.toMesh(glassIntMat);
    if (glassIntMesh) group.add(glassIntMesh);

    scene.add(group);
    return group;
  }

  // -------------------------------------------------------
  // ROOM IMPOSTOR CANVAS — blurred 2D suggestion of room contents
  // -------------------------------------------------------
  function makeRoomImpostorCanvas(type) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var ctx = c.getContext('2d');
    var w = 256, h = 256;

    if (type === 'workshop') {
      // Muted workshop background
      ctx.fillStyle = '#C8C0B8';
      ctx.fillRect(0, 0, w, h);
      // Workbench (dark rectangle at bottom)
      ctx.fillStyle = '#6A5A48';
      ctx.fillRect(w * 0.05, h * 0.55, w * 0.9, h * 0.15);
      // Bench legs
      ctx.fillRect(w * 0.1, h * 0.7, w * 0.06, h * 0.28);
      ctx.fillRect(w * 0.84, h * 0.7, w * 0.06, h * 0.28);
      // Tool rack (pegs on wall)
      ctx.fillStyle = '#8A7A68';
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.04);
      // Hanging tools silhouettes
      ctx.fillStyle = '#555';
      var toolWidths = [0.04, 0.03, 0.06, 0.03, 0.05, 0.04, 0.03];
      for (var t = 0; t < toolWidths.length; t++) {
        var tx = w * (0.12 + t * 0.11);
        ctx.fillRect(tx, h * 0.16, w * toolWidths[t], h * (0.08 + Math.random() * 0.12));
      }
      // Desk lamp glow
      ctx.fillStyle = 'rgba(255,240,200,0.15)';
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.48, w * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Lamp arm
      ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.72, h * 0.55); ctx.lineTo(w * 0.72, h * 0.35); ctx.stroke();
      // Blur everything slightly
      makeNoise(ctx, w, h, 12);

    } else if (type === 'kitchen') {
      ctx.fillStyle = '#E8E0D0';
      ctx.fillRect(0, 0, w, h);
      // Upper cabinets
      ctx.fillStyle = '#C8C0B0';
      ctx.fillRect(w * 0.05, h * 0.08, w * 0.38, h * 0.28);
      ctx.fillRect(w * 0.55, h * 0.08, w * 0.38, h * 0.28);
      // Cabinet handles
      ctx.fillStyle = '#888';
      ctx.fillRect(w * 0.20, h * 0.20, w * 0.02, h * 0.06);
      ctx.fillRect(w * 0.70, h * 0.20, w * 0.02, h * 0.06);
      // Counter
      ctx.fillStyle = '#A09888';
      ctx.fillRect(w * 0.02, h * 0.58, w * 0.96, h * 0.06);
      // Lower cabinets
      ctx.fillStyle = '#C8C0B0';
      ctx.fillRect(w * 0.02, h * 0.64, w * 0.96, h * 0.34);
      // Sink basin (dark oval)
      ctx.fillStyle = '#8A8A8A';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.60, w * 0.10, h * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tap
      ctx.strokeStyle = '#777'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.57); ctx.lineTo(w * 0.5, h * 0.46); ctx.stroke();
      makeNoise(ctx, w, h, 10);

    } else if (type === 'toilet') {
      ctx.fillStyle = '#E0E0E0';
      ctx.fillRect(0, 0, w, h);
      // Tile grid (subtle)
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
      for (var ty = 0; ty < h; ty += 32) {
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke();
      }
      for (var tx = 0; tx < w; tx += 32) {
        ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, h); ctx.stroke();
      }
      // Toilet silhouette
      ctx.fillStyle = '#D4D4D4';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.75, w * 0.12, h * 0.10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.40, h * 0.60, w * 0.20, h * 0.18);
      // Cistern
      ctx.fillStyle = '#CCCCCC';
      ctx.fillRect(w * 0.38, h * 0.52, w * 0.24, h * 0.10);
      // Small basin
      ctx.fillStyle = '#D4D4D4';
      ctx.beginPath();
      ctx.ellipse(w * 0.25, h * 0.58, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      // Mirror
      ctx.fillStyle = '#B8C8D0';
      ctx.fillRect(w * 0.15, h * 0.18, w * 0.20, h * 0.28);
      ctx.strokeStyle = '#AAA'; ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.15, h * 0.18, w * 0.20, h * 0.28);
      makeNoise(ctx, w, h, 8);
    }
    return c;
  }

  // -------------------------------------------------------
  // LIGHTING
  // -------------------------------------------------------
  function buildLighting(scene) {
    // Soft ambient (slightly warm)
    var ambient = new THREE.AmbientLight(0x8899AA, 0.4);
    scene.add(ambient);

    // Sky/ground hemisphere — strong outdoors contribution
    var hemi = new THREE.HemisphereLight(0x88BBDD, 0x886644, 0.8);
    scene.add(hemi);

    // Main sun — lower angle for raking light and longer shadows
    var sun = new THREE.DirectionalLight(0xFFF0D0, 1.8);
    sun.position.set(35, 45, -25);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);

    // Cool fill light from opposite side (prevents pitch-black shadows)
    var fill = new THREE.DirectionalLight(0x99AACC, 0.35);
    fill.position.set(-25, 30, 20);
    scene.add(fill);

    // Subtle warm bounce from the ground
    var bounce = new THREE.DirectionalLight(0xDDCC99, 0.15);
    bounce.position.set(0, -10, 0);
    scene.add(bounce);

    // #7 — Warm/cool gradient across the street (east = warm afternoon sun, west = cool shade)
    var warmStreet = new THREE.PointLight(0xFFDDAA, 0.4, 30);
    warmStreet.position.set(96, 5, 51.5);
    scene.add(warmStreet);
    var coolStreet = new THREE.PointLight(0x99AACC, 0.25, 25);
    coolStreet.position.set(62, 5, 51.5);
    scene.add(coolStreet);

    // #7 — AO boost under north cornice (dark strip simulating ambient occlusion)
    var aoMerger = new GeoMerger();
    // North side: cornice runs roughly x:56-104 at z:48, y ≈ fasciaTop (3.0)
    aoMerger.addPlane(80, 3.05, 48.1, 48, 0.6, -Math.PI/2, 0);
    // South side: cornice at z:55
    aoMerger.addPlane(80, 3.05, 54.9, 48, 0.6, -Math.PI/2, 0);
    var aoMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.15,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    });
    var aoMesh = aoMerger.toMesh(aoMat);
    if (aoMesh) scene.add(aoMesh);

    // Shop interior lights
    var shop = XJ.SHOP;
    var showroom = shop.rooms[0];
    var workshop = shop.rooms[1];
    var showCX = (showroom.minX + showroom.maxX) / 2;
    var showCZ = (showroom.minZ + showroom.maxZ) / 2;

    var pl1 = new THREE.PointLight(C.warmLight, 1.2, 10);
    pl1.position.set(showCX, 2.8, showCZ);
    scene.add(pl1);
    var pl3 = new THREE.PointLight(C.warmLight, 0.6, 8);
    pl3.position.set((workshop.minX + workshop.maxX)/2, 2.8, (workshop.minZ + workshop.maxZ)/2);
    scene.add(pl3);

    return { ambient: ambient, hemi: hemi, sun: sun };
  }

  // -------------------------------------------------------
  // STREET PROPS — bins, bollards, bench (#8)
  // -------------------------------------------------------
  function buildStreetProps(scene) {
    var group = new THREE.Group();
    var metalMerger = new GeoMerger();    // dark metal (bins, bollards)
    var woodMerger = new GeoMerger();     // bench slats
    var metalFrameMerger = new GeoMerger(); // bench frame

    // --- Bollards (4 along north kerb, break up pavement edge) ---
    var bollardPositions = [
      { x: 64, z: 49.2 },
      { x: 72, z: 49.2 },
      { x: 88, z: 49.2 },
      { x: 96, z: 49.2 }
    ];
    for (var i = 0; i < bollardPositions.length; i++) {
      var bp = bollardPositions[i];
      metalMerger.addCylinder(bp.x, 0.45, bp.z, 0.08, 0.10, 0.9, 8);
      // Dome top
      metalMerger.addCylinder(bp.x, 0.92, bp.z, 0.001, 0.08, 0.04, 8);
    }

    // --- Litter bin (south pavement, near the chippy) ---
    var binX = 89, binZ = 54.2;
    // Body (cylinder)
    metalMerger.addCylinder(binX, 0.45, binZ, 0.22, 0.20, 0.9, 8);
    // Rim
    metalMerger.addCylinder(binX, 0.92, binZ, 0.24, 0.24, 0.06, 8);
    // Pedestal
    metalMerger.addCylinder(binX, 0.03, binZ, 0.18, 0.22, 0.06, 8);

    // --- Second bin (north pavement, near coffee house) ---
    var bin2X = 59, bin2Z = 49.0;
    metalMerger.addCylinder(bin2X, 0.45, bin2Z, 0.22, 0.20, 0.9, 8);
    metalMerger.addCylinder(bin2X, 0.92, bin2Z, 0.24, 0.24, 0.06, 8);
    metalMerger.addCylinder(bin2X, 0.03, bin2Z, 0.18, 0.22, 0.06, 8);

    // --- Bench (south pavement, between bakery and fashion outlet) ---
    var benchX = 66, benchZ = 54.3;
    var seatH = 0.45, seatW = 1.4, seatD = 0.38;
    // Seat slats (4 wooden planks)
    for (var s = 0; s < 4; s++) {
      var sz = benchZ - seatD/2 + s * (seatD / 3.5) + 0.04;
      woodMerger.addBox(benchX, seatH, sz, seatW, 0.04, 0.08);
    }
    // Backrest slats (3 planks)
    for (var s = 0; s < 3; s++) {
      var by = seatH + 0.12 + s * 0.14;
      woodMerger.addBox(benchX, by, benchZ - seatD/2 - 0.02, seatW, 0.035, 0.06);
    }
    // Legs (2 cast-iron ends)
    for (var side = -1; side <= 1; side += 2) {
      var lx = benchX + side * (seatW/2 - 0.06);
      metalFrameMerger.addBox(lx, seatH/2, benchZ, 0.06, seatH, seatD + 0.04);
      // Backrest support
      metalFrameMerger.addBox(lx, seatH + 0.24, benchZ - seatD/2 - 0.02, 0.06, 0.52, 0.06);
    }

    // Build merged meshes
    var metalMat = new THREE.MeshLambertMaterial({ color: 0x2A2A2A });
    var metalMesh = metalMerger.toMesh(metalMat, { castShadow: true, receiveShadow: true });
    if (metalMesh) group.add(metalMesh);

    var woodMat = new THREE.MeshLambertMaterial({ color: 0x8B6E4E });
    var woodMesh = woodMerger.toMesh(woodMat, { castShadow: true, receiveShadow: true });
    if (woodMesh) group.add(woodMesh);

    var frameMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
    var frameMesh = metalFrameMerger.toMesh(frameMat, { castShadow: true });
    if (frameMesh) group.add(frameMesh);

    scene.add(group);
    return group;
  }

  // -------------------------------------------------------
  // BLOCKS — generic independent box primitives
  // -------------------------------------------------------
  function buildBlocks(scene) {
    var blocks = XJ.BLOCKS;
    if (!blocks || blocks.length === 0) return null;

    var group = new THREE.Group();
    for (var i = 0; i < blocks.length; i++) {
      var bl = blocks[i];
      var opacity = bl.opacity !== undefined ? bl.opacity : 1.0;
      var isTransparent = opacity < 1.0;
      var color = bl.color;

      var matOpts = {};
      if (isTransparent) {
        matOpts.transparent = true;
        matOpts.opacity = opacity;
        matOpts.depthWrite = false;
        matOpts.side = THREE.DoubleSide;
      }

      var blockMat = new THREE.MeshLambertMaterial(Object.assign({ color: color }, matOpts));
      var geo = new THREE.BoxGeometry(bl.w, bl.h, bl.d);
      var mesh = new THREE.Mesh(geo, blockMat);
      mesh.position.set(bl.x, bl.y, bl.z);
      if (bl.rot) mesh.rotation.y = bl.rot;
      mesh.castShadow = !isTransparent;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    scene.add(group);
    return group;
  }

  return {
    buildGround: buildGround,
    buildSky: buildSky,
    buildRoads: buildRoads,
    buildShop: buildShop,
    buildHighRises: buildHighRises,
    buildLamps: buildLamps,
    buildShopFronts: buildShopFronts,
    buildShopFurniture: buildShopFurniture,
    buildBlocks: buildBlocks,
    buildLighting: buildLighting,
    buildStreetProps: buildStreetProps,
    // Shared resources for editor
    textures: {
      building: buildingTex,
      brick: brickTex,
      ground: groundTex,
      road: roadTex,
      sidewalk: sidewalkTex,
      shopWall: shopWallTex,
      cleanInterior: cleanInteriorTex,
      ceilingTile: ceilingTileTex
    },
    applyWorldUVs: applyWorldUVs,
    getFaceVisibility: getFaceVisibility,
    makeShopSignCanvas: makeShopSignCanvas,
    makeWindowDisplayCanvas: makeWindowDisplayCanvas,
    makeDoorCanvas: makeDoorCanvas
  };
})();
