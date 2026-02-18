// ============================================================
// EDITOR-CONSOLE — Monkey-patched console output panel
// ============================================================

var EditorConsole = (function() {
  'use strict';

  var outputEl, panel, toggleBtn;
  var MAX_ENTRIES = 500;
  var origLog, origWarn, origError;

  function init() {
    outputEl = document.getElementById('console-output');
    panel = document.getElementById('bottom-panel');
    toggleBtn = document.getElementById('btn-toggle-console');
    var clearBtn = document.getElementById('btn-clear-console');

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (outputEl) outputEl.innerHTML = '';
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        if (panel.classList.contains('collapsed')) {
          panel.classList.remove('collapsed');
          panel.style.height = '150px';
          toggleBtn.innerHTML = '&#9662;'; // down arrow
        } else {
          panel.classList.add('collapsed');
          panel.style.height = '';
          toggleBtn.innerHTML = '&#9656;'; // right arrow
        }
        EditorViewport.onResize();
      });
    }

    // Monkey-patch console methods
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;

    console.log = function() {
      origLog.apply(console, arguments);
      addEntry('log', arguments);
    };
    console.warn = function() {
      origWarn.apply(console, arguments);
      addEntry('warn', arguments);
    };
    console.error = function() {
      origError.apply(console, arguments);
      addEntry('error', arguments);
    };
  }

  function addEntry(level, args) {
    if (!outputEl) return;

    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'object') {
        try { parts.push(JSON.stringify(a)); } catch(e) { parts.push(String(a)); }
      } else {
        parts.push(String(a));
      }
    }

    var now = new Date();
    var ts = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());

    var div = document.createElement('div');
    div.className = 'console-entry ' + level;
    div.textContent = '[' + ts + '] ' + level.toUpperCase() + '  ' + parts.join(' ');
    outputEl.appendChild(div);

    // Cap entries
    while (outputEl.children.length > MAX_ENTRIES) {
      outputEl.removeChild(outputEl.firstChild);
    }

    // Auto-scroll
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  return {
    init: init
  };
})();
