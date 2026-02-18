// ============================================================
// EDITOR-SKYBOX — Procedural sky presets (equirectangular)
// ============================================================

var EditorSkybox = (function() {
  'use strict';

  var W = 2048, H = 1024;
  var currentPreset = 'clearDay';
  var sceneRef = null;
  var cache = {}; // preset → THREE.CanvasTexture

  // -------------------------------------------------------
  // PRESET DEFINITIONS
  // Each returns { canvas, fogColor, fogNear, fogFar }
  // -------------------------------------------------------

  var PRESETS = {

    // --- Clear Day: blue sky, sun glow, fluffy clouds ---
    clearDay: {
      label: 'Clear Day',
      fogColor: 0xC8DAE8, fogNear: 80, fogFar: 200,
      build: function(ctx, w, h) {
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
        // Sun glow
        var sx = w * 0.25, sy = h * 0.46;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.18);
        sg.addColorStop(0.0, 'rgba(255,252,235,0.7)');
        sg.addColorStop(0.2, 'rgba(255,235,190,0.4)');
        sg.addColorStop(0.5, 'rgba(255,210,160,0.15)');
        sg.addColorStop(1.0, 'rgba(255,200,150,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
        // Clouds
        addClouds(ctx, w, h, 50, 'rgba(255,255,255,', 0.12, 0.25, 0.2, 0.42);
        // Horizon haze
        var hz = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.54);
        hz.addColorStop(0.0, 'rgba(210,225,238,0)');
        hz.addColorStop(0.3, 'rgba(210,225,238,0.25)');
        hz.addColorStop(0.7, 'rgba(200,215,228,0.25)');
        hz.addColorStop(1.0, 'rgba(200,215,228,0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, 0, w, h);
      }
    },

    // --- Sunset: warm orange/red horizon, deep upper sky ---
    sunset: {
      label: 'Sunset',
      fogColor: 0xD4956A, fogNear: 60, fogFar: 180,
      build: function(ctx, w, h) {
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0.00, '#0a0a2a');
        grad.addColorStop(0.15, '#1a1a4a');
        grad.addColorStop(0.30, '#3a2a5a');
        grad.addColorStop(0.40, '#8a4a5a');
        grad.addColorStop(0.45, '#cc6633');
        grad.addColorStop(0.48, '#ee8844');
        grad.addColorStop(0.50, '#ffaa55');
        grad.addColorStop(0.52, '#ee8844');
        grad.addColorStop(0.55, '#cc6633');
        grad.addColorStop(0.65, '#6a3a3a');
        grad.addColorStop(0.80, '#3a2a2a');
        grad.addColorStop(1.00, '#2a1a1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Sun glow (large, warm)
        var sx = w * 0.7, sy = h * 0.49;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.25);
        sg.addColorStop(0.0, 'rgba(255,220,120,0.9)');
        sg.addColorStop(0.15, 'rgba(255,180,80,0.6)');
        sg.addColorStop(0.4, 'rgba(255,120,50,0.25)');
        sg.addColorStop(1.0, 'rgba(200,60,30,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
        // Wispy clouds
        addClouds(ctx, w, h, 30, 'rgba(255,180,100,', 0.08, 0.2, 0.25, 0.45);
      }
    },

    // --- Night: dark sky, stars, subtle moon glow ---
    night: {
      label: 'Night',
      fogColor: 0x0A0A1A, fogNear: 40, fogFar: 150,
      build: function(ctx, w, h) {
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0.00, '#020210');
        grad.addColorStop(0.30, '#060618');
        grad.addColorStop(0.45, '#0a0a24');
        grad.addColorStop(0.50, '#101830');
        grad.addColorStop(0.55, '#0a0a20');
        grad.addColorStop(0.70, '#060610');
        grad.addColorStop(1.00, '#030308');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Stars
        addStars(ctx, w, h, 600);
        // Moon glow
        var mx = w * 0.3, my = h * 0.2;
        var mg = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.12);
        mg.addColorStop(0.0, 'rgba(200,210,240,0.4)');
        mg.addColorStop(0.3, 'rgba(150,170,210,0.15)');
        mg.addColorStop(1.0, 'rgba(100,120,180,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(0, 0, w, h);
        // Moon disc
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230,235,250,0.8)';
        ctx.fill();
      }
    },

    // --- Overcast: flat gray, moody ---
    overcast: {
      label: 'Overcast',
      fogColor: 0x8A9098, fogNear: 50, fogFar: 140,
      build: function(ctx, w, h) {
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0.00, '#5a6068');
        grad.addColorStop(0.20, '#707880');
        grad.addColorStop(0.40, '#8a9098');
        grad.addColorStop(0.48, '#9aa0a8');
        grad.addColorStop(0.50, '#a0a6ae');
        grad.addColorStop(0.52, '#9aa0a8');
        grad.addColorStop(0.60, '#7a8088');
        grad.addColorStop(0.80, '#5a6068');
        grad.addColorStop(1.00, '#4a5058');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Heavy cloud layer
        addClouds(ctx, w, h, 80, 'rgba(180,185,190,', 0.06, 0.15, 0.15, 0.55);
        addClouds(ctx, w, h, 40, 'rgba(120,125,130,', 0.04, 0.10, 0.25, 0.50);
      }
    },

    // --- Dawn: pink/purple horizon, transitional ---
    dawn: {
      label: 'Dawn',
      fogColor: 0xC8A0B0, fogNear: 60, fogFar: 180,
      build: function(ctx, w, h) {
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0.00, '#0a0a30');
        grad.addColorStop(0.15, '#1a1a50');
        grad.addColorStop(0.28, '#3a2a60');
        grad.addColorStop(0.38, '#6a4070');
        grad.addColorStop(0.44, '#b06888');
        grad.addColorStop(0.48, '#dda0aa');
        grad.addColorStop(0.50, '#eeccbb');
        grad.addColorStop(0.52, '#ddaaaa');
        grad.addColorStop(0.56, '#aa7080');
        grad.addColorStop(0.65, '#6a4060');
        grad.addColorStop(0.80, '#3a2a40');
        grad.addColorStop(1.00, '#1a1020');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Horizon glow
        var sx = w * 0.5, sy = h * 0.49;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.3);
        sg.addColorStop(0.0, 'rgba(255,200,180,0.35)');
        sg.addColorStop(0.4, 'rgba(255,150,130,0.12)');
        sg.addColorStop(1.0, 'rgba(200,100,100,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
        // Faint stars in upper sky
        addStars(ctx, w, h, 150);
        // Light clouds
        addClouds(ctx, w, h, 25, 'rgba(255,200,180,', 0.06, 0.15, 0.22, 0.42);
      }
    },

    // --- Space: black void, dense stars, nebula tint ---
    space: {
      label: 'Space',
      fogColor: 0x020208, fogNear: 100, fogFar: 400,
      build: function(ctx, w, h) {
        ctx.fillStyle = '#020208';
        ctx.fillRect(0, 0, w, h);
        // Dense stars
        addStars(ctx, w, h, 1500);
        // Nebula tint
        var nx = w * 0.6, ny = h * 0.3;
        var ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, h * 0.35);
        ng.addColorStop(0.0, 'rgba(40,20,80,0.3)');
        ng.addColorStop(0.4, 'rgba(20,10,60,0.15)');
        ng.addColorStop(1.0, 'rgba(10,5,30,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, w, h);
        var n2x = w * 0.2, n2y = h * 0.6;
        var n2 = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, h * 0.25);
        n2.addColorStop(0.0, 'rgba(20,40,80,0.2)');
        n2.addColorStop(0.5, 'rgba(10,20,50,0.1)');
        n2.addColorStop(1.0, 'rgba(5,10,30,0)');
        ctx.fillStyle = n2;
        ctx.fillRect(0, 0, w, h);
      }
    },

    // --- None: no sky background, just solid editor color ---
    none: {
      label: 'None',
      fogColor: 0x1A1A1A, fogNear: 100, fogFar: 300,
      build: null
    }
  };

  // -------------------------------------------------------
  // HELPERS — shared drawing routines
  // -------------------------------------------------------

  function addClouds(ctx, w, h, count, rgbaPrefix, alphaMin, alphaRange, yMin, yRange) {
    for (var i = 0; i < count; i++) {
      var cx = Math.random() * w;
      var cy = h * (yMin + Math.random() * yRange);
      var cw = 50 + Math.random() * 140;
      var ch = 12 + Math.random() * 28;
      var alpha = alphaMin + Math.random() * alphaRange;
      ctx.fillStyle = rgbaPrefix + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
      for (var j = 0; j < 4; j++) {
        var dx = (Math.random() - 0.5) * cw * 1.4;
        var dy = (Math.random() - 0.5) * ch * 0.8;
        var dr = 8 + Math.random() * cw * 0.35;
        ctx.fillStyle = rgbaPrefix + (alpha * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, dr, dr * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function addStars(ctx, w, h, count) {
    for (var i = 0; i < count; i++) {
      var sx = Math.random() * w;
      var sy = Math.random() * h;
      // Concentrate in upper/lower sky, sparse near horizon
      var horizonDist = Math.abs(sy / h - 0.5) * 2; // 0 at horizon, 1 at poles
      if (Math.random() > horizonDist * 0.8 + 0.2) continue;
      var size = 0.3 + Math.random() * 1.2;
      var brightness = 0.4 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + brightness.toFixed(2) + ')';
      ctx.fill();
    }
  }

  // -------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------

  function init(scene) {
    sceneRef = scene;
  }

  function apply(presetName) {
    if (!sceneRef) return;
    var preset = PRESETS[presetName];
    if (!preset) preset = PRESETS.clearDay;
    currentPreset = presetName;

    if (!preset.build) {
      // "none" — solid color background
      sceneRef.background = new THREE.Color(0x1a1a1a);
      sceneRef.environment = null;
      sceneRef.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
      return;
    }

    var tex = cache[presetName];
    if (!tex) {
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      preset.build(ctx, W, H);
      tex = new THREE.CanvasTexture(canvas);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      cache[presetName] = tex;
    }

    sceneRef.background = tex;
    sceneRef.environment = tex;
    sceneRef.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
  }

  function getCurrent() {
    return currentPreset;
  }

  function getPresetNames() {
    var names = [];
    for (var k in PRESETS) names.push(k);
    return names;
  }

  function getPresetLabel(name) {
    return PRESETS[name] ? PRESETS[name].label : name;
  }

  return {
    init: init,
    apply: apply,
    getCurrent: getCurrent,
    getPresetNames: getPresetNames,
    getPresetLabel: getPresetLabel
  };
})();
