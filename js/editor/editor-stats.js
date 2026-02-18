// ============================================================
// EDITOR-STATS — Performance overlay (FPS, draw calls, triangles)
// ============================================================

var EditorStats = (function() {
  'use strict';

  var overlay = null;
  var items = [];
  var frames = 0;
  var lastTime = 0;
  var fps = 0;
  var renderer = null;
  var visible = true;

  function init() {
    renderer = EditorViewport.getRenderer();

    overlay = document.createElement('div');
    overlay.id = 'perf-stats';
    overlay.style.cssText = [
      'position:absolute', 'top:6px', 'z-index:20',
      'display:flex', 'gap:10px',
      'background:rgba(30,30,30,0.55)', 'backdrop-filter:blur(6px)',
      'color:#aaa', 'font:10px "Segoe UI",Arial,sans-serif',
      'padding:4px 10px', 'border-radius:3px', 'border:1px solid rgba(255,255,255,0.06)',
      'pointer-events:none', 'user-select:none'
    ].join(';') + ';';

    var defs = [
      { id: 'fps',  label: 'FPS' },
      { id: 'draw', label: 'DRAW' },
      { id: 'tri',  label: 'TRIS' },
      { id: 'geo',  label: 'GEO' },
      { id: 'tex',  label: 'TEX' }
    ];

    for (var i = 0; i < defs.length; i++) {
      var item = document.createElement('span');
      var lbl = document.createElement('span');
      lbl.textContent = defs[i].label + ' ';
      lbl.style.cssText = 'color:#666;font-size:9px;letter-spacing:0.5px;';
      var val = document.createElement('span');
      val.style.cssText = 'color:#ccc;';
      item.appendChild(lbl);
      item.appendChild(val);
      overlay.appendChild(item);
      items.push(val);
    }

    var canvasWrap = document.getElementById('canvas-wrap');
    (canvasWrap || document.body).appendChild(overlay);

    lastTime = performance.now();
    setInterval(refresh, 500);

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '`') {
        visible = !visible;
        overlay.style.display = visible ? 'flex' : 'none';
      }
    });
  }

  function tick() { frames++; }

  function refresh() {
    if (!renderer) renderer = EditorViewport.getRenderer();
    if (!renderer) return;

    var now = performance.now();
    var dt = (now - lastTime) / 1000;
    if (dt > 0) fps = Math.round(frames / dt);
    frames = 0;
    lastTime = now;

    // Position at top-right of 3D viewport (left of quad divider)
    if (typeof EditorQuad !== 'undefined') {
      var wrap = document.getElementById('canvas-wrap');
      if (wrap) {
        var vpWidth = EditorQuad.getSlot0() ? EditorQuad.getSlot0().w * wrap.clientWidth : wrap.clientWidth * 0.75;
        overlay.style.left = (vpWidth - overlay.offsetWidth - 6) + 'px';
      }
    }

    var info = renderer.info;
    items[0].textContent = fps;
    items[0].style.color = fps >= 50 ? '#8cb' : fps >= 30 ? '#cb8' : '#c66';
    items[1].textContent = info.render.calls;
    items[2].textContent = formatNum(info.render.triangles);
    items[3].textContent = info.memory.geometries;
    items[4].textContent = info.memory.textures;
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return '' + n;
  }

  function toggle() {
    visible = !visible;
    if (overlay) overlay.style.display = visible ? 'flex' : 'none';
  }

  return { init: init, tick: tick, toggle: toggle };
})();
