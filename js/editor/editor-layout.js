// ============================================================
// EDITOR-LAYOUT — Resizable panel dividers
// ============================================================

var EditorLayout = (function() {
  'use strict';

  var leftPanel, viewportWrap, rightPanel, bottomPanel;
  var resizeLeft, resizeRight, resizeBottom;
  var activeHandle = null;
  var startX = 0, startY = 0;
  var startSize = 0;

  // Constraints
  var LEFT_MIN = 180;
  var RIGHT_MIN = 200;
  var VIEWPORT_MIN_W = 400;
  var BOTTOM_MIN = 0;
  var BOTTOM_MAX = 400;

  function init() {
    leftPanel = document.getElementById('left-panel');
    viewportWrap = document.getElementById('viewport-wrap');
    rightPanel = document.getElementById('right-panel');
    bottomPanel = document.getElementById('bottom-panel');
    resizeLeft = document.getElementById('resize-left');
    resizeRight = document.getElementById('resize-right');
    resizeBottom = document.getElementById('resize-bottom');

    if (resizeLeft) {
      resizeLeft.addEventListener('mousedown', function(e) {
        e.preventDefault();
        activeHandle = 'left';
        startX = e.clientX;
        startSize = leftPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
    }

    if (resizeRight) {
      resizeRight.addEventListener('mousedown', function(e) {
        e.preventDefault();
        activeHandle = 'right';
        startX = e.clientX;
        startSize = rightPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
    }

    if (resizeBottom) {
      resizeBottom.addEventListener('mousedown', function(e) {
        e.preventDefault();
        // Uncollapse if collapsed
        if (bottomPanel.classList.contains('collapsed')) {
          bottomPanel.classList.remove('collapsed');
          bottomPanel.style.height = '150px';
        }
        activeHandle = 'bottom';
        startY = e.clientY;
        startSize = bottomPanel.offsetHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      });
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!activeHandle) return;

    if (activeHandle === 'left') {
      var dx = e.clientX - startX;
      var newWidth = startSize + dx;
      var maxLeft = window.innerWidth - rightPanel.offsetWidth - VIEWPORT_MIN_W - 10; // 10 for handles
      newWidth = Math.max(LEFT_MIN, Math.min(maxLeft, newWidth));
      leftPanel.style.width = newWidth + 'px';
      EditorViewport.onResize();
    }

    if (activeHandle === 'right') {
      var dx = startX - e.clientX;
      var newWidth = startSize + dx;
      var maxRight = window.innerWidth - leftPanel.offsetWidth - VIEWPORT_MIN_W - 10;
      newWidth = Math.max(RIGHT_MIN, Math.min(maxRight, newWidth));
      rightPanel.style.width = newWidth + 'px';
      EditorViewport.onResize();
    }

    if (activeHandle === 'bottom') {
      var dy = startY - e.clientY;
      var newHeight = startSize + dy;
      newHeight = Math.max(BOTTOM_MIN, Math.min(BOTTOM_MAX, newHeight));
      bottomPanel.style.height = newHeight + 'px';
      EditorViewport.onResize();
    }
  }

  function onMouseUp() {
    if (!activeHandle) return;
    activeHandle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    EditorViewport.onResize();
  }

  return {
    init: init
  };
})();
