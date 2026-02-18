// ============================================================
// NPCS — Ambient pedestrian system (generalized)
// Data-driven from npcPaths in scene.json.
// Each path defines walk line, bounds, behavior, appearance.
// ============================================================

var NPCSystem = (function() {
  'use strict';

  // --- Default constants (overridable per-path via scene data) ---
  var PAVEMENT_Y     = 0.13;
  var WALK_SPEED_MIN = 1.1;
  var WALK_SPEED_MAX = 1.4;
  var BROWSE_CHANCE  = 0.35;
  var BROWSE_MIN     = 1.5;
  var BROWSE_MAX     = 3.0;
  var ENTER_CHANCE   = 0.15;
  var INSIDE_MIN     = 15;
  var INSIDE_MAX     = 30;
  var FADE_TIME      = 0.5;
  var SPAWN_INTERVAL_MIN = 2.0;
  var SPAWN_INTERVAL_MAX = 4.0;

  // --- Per-path data (populated from scene.json or XJ.NPC_PATHS) ---
  var paths = [];
  // Each path: { walkZ, browseZ, face, dir, side, minX, maxX,
  //              maxNpcs, spawnInterval, walkSpeedMin, walkSpeedMax,
  //              browseChance, enterChance, pavementY, pool[], spawnTimer }

  function loadPaths() {
    paths = [];
    var source = null;

    // Try Engine registry — look for objects with npc behavior
    if (typeof Engine !== 'undefined' && Engine.getAllEntries) {
      var entries = Engine.getAllEntries();
      var pathData = [];
      for (var id in entries) {
        var edata = entries[id].data;
        if (!edata || !edata.behaviors) continue;
        for (var bi = 0; bi < edata.behaviors.length; bi++) {
          if (edata.behaviors[bi].type === 'npc') {
            var npcB = edata.behaviors[bi];
            pathData.push({
              walkZ: npcB.walkZ || edata.z || 0,
              browseZ: npcB.browseZ || (edata.z || 0) - 0.5,
              face: npcB.face || 's',
              dir: npcB.dir || 1,
              side: npcB.side || 'north',
              minX: npcB.minX || (edata.x || 0) - 25,
              maxX: npcB.maxX || (edata.x || 0) + 25,
              maxNpcs: npcB.maxNpcs || 4,
              spawnInterval: npcB.spawnInterval || 3,
              walkSpeedMin: npcB.walkSpeedMin,
              walkSpeedMax: npcB.walkSpeedMax,
              browseChance: npcB.browseChance,
              enterChance: npcB.enterChance,
              pavementY: npcB.pavementY
            });
            break;
          }
        }
      }
      if (pathData.length > 0) source = pathData;
    }

    // Fallback to XJ.NPC_PATHS
    if (!source && typeof XJ !== 'undefined' && XJ.NPC_PATHS && XJ.NPC_PATHS.length > 0) {
      source = XJ.NPC_PATHS;
    }

    // Fallback to hardcoded defaults
    if (!source) {
      source = [
        { walkZ: 49.0, browseZ: 48.5, face: 's', dir: 1, side: 'north', minX: 56, maxX: 104, maxNpcs: 4, spawnInterval: 3 },
        { walkZ: 54.0, browseZ: 54.5, face: 'n', dir: -1, side: 'south', minX: 56, maxX: 104, maxNpcs: 4, spawnInterval: 3 }
      ];
    }

    for (var i = 0; i < source.length; i++) {
      var np = source[i];
      paths.push({
        walkZ: np.walkZ,
        browseZ: np.browseZ,
        face: np.face,
        dir: typeof np.dir === 'string' ? parseInt(np.dir, 10) : (np.dir || 1),
        side: np.side || 'north',
        minX: np.minX || 0,
        maxX: np.maxX || 100,
        maxNpcs: np.maxNpcs || 4,
        spawnInterval: np.spawnInterval || 3,
        walkSpeedMin: np.walkSpeedMin || WALK_SPEED_MIN,
        walkSpeedMax: np.walkSpeedMax || WALK_SPEED_MAX,
        browseChance: np.browseChance !== undefined ? np.browseChance : BROWSE_CHANCE,
        enterChance: np.enterChance !== undefined ? np.enterChance : ENTER_CHANCE,
        pavementY: np.pavementY !== undefined ? np.pavementY : PAVEMENT_Y,
        pool: [],
        spawnTimer: 0.5 + Math.random()
      });
    }
  }

  // --- Body part dimensions ---
  var BODY = {
    head:  { w: 0.24, h: 0.26, d: 0.24 },
    torso: { w: 0.34, h: 0.50, d: 0.18 },
    arm:   { w: 0.09, h: 0.38, d: 0.09 },
    leg:   { w: 0.12, h: 0.82, d: 0.12 }
  };

  var LEG_Y     = BODY.leg.h;
  var TORSO_Y   = BODY.leg.h + BODY.torso.h / 2;
  var ARM_Y     = TORSO_Y + BODY.torso.h / 2 - 0.04;
  var HEAD_Y    = TORSO_Y + BODY.torso.h / 2 + BODY.head.h / 2 + 0.02;

  // --- Color palettes ---
  var SKIN_COLORS  = [0xF5D0A9, 0xD2A67C, 0xC68642, 0x8D5524, 0x6B3A2A, 0xFFDBC4];
  var SHIRT_COLORS = [0x2244AA, 0xAA2233, 0x228844, 0x884488, 0xCC8833, 0x333333, 0xDDDDDD, 0x336699, 0x993355, 0x557755];
  var PANTS_COLORS = [0x222233, 0x333344, 0x444444, 0x2A2A3A, 0x554433, 0x3A3A3A];
  var HAIR_COLORS  = [0x1A1A1A, 0x3A2A1A, 0x6B4423, 0xA06030, 0xD4A040, 0x888888, 0xC03020];

  // --- Shared geometries ---
  var sharedGeo = null;

  function createSharedGeometries() {
    if (sharedGeo) return;
    sharedGeo = {
      head:  new THREE.BoxGeometry(BODY.head.w, BODY.head.h, BODY.head.d),
      torso: new THREE.BoxGeometry(BODY.torso.w, BODY.torso.h, BODY.torso.d),
      arm:   new THREE.BoxGeometry(BODY.arm.w, BODY.arm.h, BODY.arm.d),
      leg:   new THREE.BoxGeometry(BODY.leg.w, BODY.leg.h, BODY.leg.d)
    };
    sharedGeo.arm.translate(0, -BODY.arm.h / 2, 0);
    sharedGeo.leg.translate(0, -BODY.leg.h / 2, 0);
  }

  // --- Interest points ---
  var interestPoints = [];

  function buildInterestPoints() {
    interestPoints = [];

    // Build from objects with interactable behavior (replaces shopfronts)
    var fronts = [];
    if (typeof Engine !== 'undefined' && Engine.getAllEntries) {
      var entries = Engine.getAllEntries();
      for (var id in entries) {
        var edata = entries[id].data;
        if (!edata || !edata.behaviors) continue;
        for (var bi = 0; bi < edata.behaviors.length; bi++) {
          if (edata.behaviors[bi].type === 'interactable') {
            fronts.push(edata);
            break;
          }
        }
      }
    }

    for (var i = 0; i < fronts.length; i++) {
      var s = fronts[i];
      // Find matching path for this shopfront
      var matchPath = null;
      for (var pi = 0; pi < paths.length; pi++) {
        if (paths[pi].face === s.face) { matchPath = paths[pi]; break; }
      }
      if (!matchPath) continue;

      var winCount = Math.max(1, Math.floor((s.w || 8) / 4));
      var winSpacing = (s.w || 8) / (winCount + 1);
      for (var wi = 0; wi < winCount; wi++) {
        interestPoints.push({
          x: (s.x || 0) + winSpacing * (wi + 1),
          z: matchPath.browseZ,
          walkZ: matchPath.walkZ,
          type: 'window',
          side: matchPath.side,
          faceAngle: (s.face === 's') ? 0 : Math.PI
        });
      }

      if (s.style !== 'empty') {
        interestPoints.push({
          x: (s.x || 0) + (s.w || 8) / 2,
          z: matchPath.browseZ,
          walkZ: matchPath.walkZ,
          type: 'door',
          side: matchPath.side,
          faceAngle: (s.face === 's') ? 0 : Math.PI
        });
      }
    }
  }

  // --- NPC class ---
  function NPC(scene) {
    this.scene = scene;
    this.state = 'despawned';
    this.speed = 0;
    this.direction = 1;
    this.path = null;
    this.animPhase = Math.random() * Math.PI * 2;
    this.stateTimer = 0;
    this.fadeAlpha = 1;
    this.targetInterest = null;
    this.intent = null;
    this.browseTimer = 0;
    this.insideTimer = 0;
    this.scale = 0.92 + Math.random() * 0.16;

    this.matSkin  = new THREE.MeshLambertMaterial({ color: pick(SKIN_COLORS) });
    this.matShirt = new THREE.MeshLambertMaterial({ color: pick(SHIRT_COLORS) });
    this.matPants = new THREE.MeshLambertMaterial({ color: pick(PANTS_COLORS) });
    this.matHair  = new THREE.MeshLambertMaterial({ color: pick(HAIR_COLORS) });
    this.materials = [this.matSkin, this.matShirt, this.matPants, this.matHair];

    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.scale.setScalar(this.scale);

    this.torsoMesh = new THREE.Mesh(sharedGeo.torso, this.matShirt);
    this.torsoMesh.position.y = TORSO_Y;
    this.root.add(this.torsoMesh);

    this.headMesh = new THREE.Mesh(sharedGeo.head, this.matSkin);
    this.headMesh.position.y = HEAD_Y;
    this.root.add(this.headMesh);

    var hairGeo = new THREE.BoxGeometry(BODY.head.w + 0.02, 0.06, BODY.head.d + 0.02);
    this.hairMesh = new THREE.Mesh(hairGeo, this.matHair);
    this.hairMesh.position.y = HEAD_Y + BODY.head.h / 2 - 0.01;
    this.root.add(this.hairMesh);

    this.leftArmPivot = new THREE.Object3D();
    this.leftArmPivot.position.set(-(BODY.torso.w / 2 + BODY.arm.w / 2 + 0.01), ARM_Y, 0);
    this.leftArmMesh = new THREE.Mesh(sharedGeo.arm, this.matShirt);
    this.leftArmPivot.add(this.leftArmMesh);
    this.root.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Object3D();
    this.rightArmPivot.position.set(BODY.torso.w / 2 + BODY.arm.w / 2 + 0.01, ARM_Y, 0);
    this.rightArmMesh = new THREE.Mesh(sharedGeo.arm, this.matShirt);
    this.rightArmPivot.add(this.rightArmMesh);
    this.root.add(this.rightArmPivot);

    this.leftLegPivot = new THREE.Object3D();
    this.leftLegPivot.position.set(-0.065, LEG_Y, 0);
    this.leftLegMesh = new THREE.Mesh(sharedGeo.leg, this.matPants);
    this.leftLegPivot.add(this.leftLegMesh);
    this.root.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Object3D();
    this.rightLegPivot.position.set(0.065, LEG_Y, 0);
    this.rightLegMesh = new THREE.Mesh(sharedGeo.leg, this.matPants);
    this.rightLegPivot.add(this.rightLegMesh);
    this.root.add(this.rightLegPivot);

    scene.add(this.root);
  }

  NPC.prototype.setTransparent = function(enabled) {
    for (var i = 0; i < this.materials.length; i++) {
      this.materials[i].transparent = enabled;
      this.materials[i].depthWrite = !enabled;
      this.materials[i].needsUpdate = true;
    }
  };

  NPC.prototype.spawn = function(path) {
    this.path = path;
    this.direction = path.dir;
    this.speed = path.walkSpeedMin + Math.random() * (path.walkSpeedMax - path.walkSpeedMin);
    this.state = 'walk';
    this.fadeAlpha = 1;
    this.targetInterest = null;
    this.intent = null;
    this.animPhase = Math.random() * Math.PI * 2;

    this.matSkin.color.setHex(pick(SKIN_COLORS));
    this.matShirt.color.setHex(pick(SHIRT_COLORS));
    this.matPants.color.setHex(pick(PANTS_COLORS));
    this.matHair.color.setHex(pick(HAIR_COLORS));
    this.scale = 0.92 + Math.random() * 0.16;
    this.root.scale.setScalar(this.scale);

    var startX = (this.direction > 0) ? path.minX - 1 : path.maxX + 1;
    this.root.position.set(startX, path.pavementY, path.walkZ);
    this.root.rotation.y = (this.direction > 0) ? Math.PI / 2 : -Math.PI / 2;

    this.setTransparent(false);
    this.setAlpha(1);
    this.root.visible = true;
  };

  NPC.prototype.despawn = function() {
    this.state = 'despawned';
    this.root.visible = false;
    this.targetInterest = null;
    this.intent = null;
  };

  NPC.prototype.setAlpha = function(a) {
    this.fadeAlpha = a;
    for (var i = 0; i < this.materials.length; i++) {
      this.materials[i].opacity = a;
    }
  };

  NPC.prototype.update = function(dt) {
    if (this.state === 'despawned') return;
    switch (this.state) {
      case 'walk':     this.updateWalk(dt);    break;
      case 'browse':   this.updateBrowse(dt);  break;
      case 'fade_out': this.updateFadeOut(dt); break;
      case 'inside':   this.updateInside(dt);  break;
      case 'fade_in':  this.updateFadeIn(dt);  break;
      case 'pause':    this.updatePause(dt);   break;
    }
  };

  NPC.prototype.updateWalk = function(dt) {
    var pos = this.root.position;
    pos.x += this.direction * this.speed * dt;

    this.animPhase += dt * this.speed * 4.5;
    var legSwing = Math.sin(this.animPhase) * 0.4;
    var armSwing = Math.sin(this.animPhase) * 0.25;

    this.leftLegPivot.rotation.x = legSwing;
    this.rightLegPivot.rotation.x = -legSwing;
    this.leftArmPivot.rotation.x = -armSwing;
    this.rightArmPivot.rotation.x = armSwing;

    var bob = Math.abs(Math.sin(this.animPhase)) * 0.012;
    this.torsoMesh.position.y = TORSO_Y + bob;
    this.headMesh.position.y = HEAD_Y + bob;

    this.root.rotation.y = (this.direction > 0) ? Math.PI / 2 : -Math.PI / 2;

    if (!this.targetInterest) {
      var closest = this.findNearInterest(pos.x);
      if (closest) {
        this.targetInterest = closest;
        if (closest.type === 'door' && Math.random() < this.path.enterChance) {
          this.intent = 'enter';
        } else if (closest.type === 'window' && Math.random() < this.path.browseChance) {
          this.intent = 'browse';
        } else {
          this.intent = null;
        }
      }
    }

    if (this.targetInterest) {
      var dx = Math.abs(pos.x - this.targetInterest.x);
      if (dx < 0.3) {
        if (this.intent === 'enter') {
          this.setTransparent(true);
          this.state = 'fade_out';
          this.stateTimer = 0;
          pos.z = this.targetInterest.z;
          this.root.rotation.y = this.targetInterest.faceAngle;
          this.resetPose();
        } else if (this.intent === 'browse') {
          this.state = 'browse';
          this.browseTimer = BROWSE_MIN + Math.random() * (BROWSE_MAX - BROWSE_MIN);
          pos.z = this.targetInterest.z;
          this.root.rotation.y = this.targetInterest.faceAngle;
          this.resetPose();
        } else {
          this.targetInterest = null;
          this.intent = null;
        }
      }
    }

    if ((this.direction > 0 && pos.x > this.path.maxX + 2) ||
        (this.direction < 0 && pos.x < this.path.minX - 2)) {
      this.despawn();
    }
  };

  NPC.prototype.updateBrowse = function(dt) {
    this.browseTimer -= dt;
    this.headMesh.rotation.y = Math.sin(this.browseTimer * 1.5) * 0.15;
    if (this.browseTimer <= 0) {
      this.state = 'walk';
      this.headMesh.rotation.y = 0;
      this.root.position.z = this.path.walkZ;
      this.root.rotation.y = (this.direction > 0) ? Math.PI / 2 : -Math.PI / 2;
      this.targetInterest = null;
      this.intent = null;
    }
  };

  NPC.prototype.updateFadeOut = function(dt) {
    this.stateTimer += dt;
    var t = Math.min(this.stateTimer / FADE_TIME, 1);
    this.setAlpha(1 - t);
    this.root.scale.setScalar(this.scale * (1 - t * 0.3));
    if (t >= 1) {
      this.root.visible = false;
      this.state = 'inside';
      this.insideTimer = INSIDE_MIN + Math.random() * (INSIDE_MAX - INSIDE_MIN);
    }
  };

  NPC.prototype.updateInside = function(dt) {
    this.insideTimer -= dt;
    if (this.insideTimer <= 0) {
      this.root.visible = true;
      this.state = 'fade_in';
      this.stateTimer = 0;
      this.setAlpha(0);
      this.root.scale.setScalar(this.scale * 0.7);
    }
  };

  NPC.prototype.updateFadeIn = function(dt) {
    this.stateTimer += dt;
    var t = Math.min(this.stateTimer / FADE_TIME, 1);
    this.setAlpha(t);
    this.root.scale.setScalar(this.scale * (0.7 + t * 0.3));
    if (t >= 1) {
      this.root.scale.setScalar(this.scale);
      this.setAlpha(1);
      this.setTransparent(false);
      this.state = 'pause';
      this.stateTimer = 0.3 + Math.random() * 0.5;
      this.targetInterest = null;
      this.intent = null;
    }
  };

  NPC.prototype.updatePause = function(dt) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'walk';
      this.root.position.z = this.path.walkZ;
      this.root.rotation.y = (this.direction > 0) ? Math.PI / 2 : -Math.PI / 2;
    }
  };

  NPC.prototype.findNearInterest = function(currentX) {
    var bestDist = Infinity;
    var best = null;
    for (var i = 0; i < interestPoints.length; i++) {
      var ip = interestPoints[i];
      if (ip.side !== this.path.side) continue;
      var dx = (ip.x - currentX) * this.direction;
      if (dx < 1.0 || dx > 2.5) continue;
      if (dx < bestDist) {
        bestDist = dx;
        best = ip;
      }
    }
    return best;
  };

  NPC.prototype.resetPose = function() {
    this.leftLegPivot.rotation.x = 0;
    this.rightLegPivot.rotation.x = 0;
    this.leftArmPivot.rotation.x = 0;
    this.rightArmPivot.rotation.x = 0;
    this.torsoMesh.position.y = TORSO_Y;
    this.headMesh.position.y = HEAD_Y;
  };

  // --- Manager ---
  var scene = null;
  var initialized = false;

  function init(sceneRef) {
    scene = sceneRef;
    loadPaths();
    createSharedGeometries();
    buildInterestPoints();

    // Create NPC pools per path
    for (var pi = 0; pi < paths.length; pi++) {
      var path = paths[pi];
      path.pool = [];
      for (var i = 0; i < path.maxNpcs; i++) {
        path.pool.push(new NPC(scene));
      }
      // Spawn initial population
      var initialCount = Math.min(Math.floor(path.maxNpcs / 2), 2);
      for (var j = 0; j < initialCount; j++) {
        spawnOnPath(path, true);
      }
    }

    initialized = true;
  }

  function spawnOnPath(path, midStreet) {
    var npc = null;
    for (var i = 0; i < path.pool.length; i++) {
      if (path.pool[i].state === 'despawned') {
        npc = path.pool[i];
        break;
      }
    }
    if (!npc) return;

    npc.spawn(path);
    if (midStreet) {
      npc.root.position.x = path.minX + Math.random() * (path.maxX - path.minX);
    }
  }

  function update(dt) {
    if (!initialized) return;

    for (var pi = 0; pi < paths.length; pi++) {
      var path = paths[pi];

      // Update all NPCs on this path
      for (var i = 0; i < path.pool.length; i++) {
        path.pool[i].update(dt);
      }

      // Spawn timer per path
      path.spawnTimer -= dt;
      if (path.spawnTimer <= 0) {
        spawnOnPath(path, false);
        var interval = path.spawnInterval || 3;
        path.spawnTimer = interval * 0.7 + Math.random() * interval * 0.6;
      }
    }
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return {
    init: init,
    update: update,
    getPaths: function() { return paths; }
  };
})();
