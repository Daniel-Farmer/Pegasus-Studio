// ============================================================
// EDITOR-PANELS — Tabbed info panel (Actions / Changes / Notes)
// Single panel with tab switching, replaces 3 separate panels.
// ============================================================

var EditorPanels = (function() {
  'use strict';

  var actionButtons = [];
  var changesBody, notesTextarea;
  var lastLogLen = 0;
  var saveTimer = null;
  var rebuildFn = null;

  // Tab state
  var tabs = [];      // button elements
  var pages = [];     // page elements
  var activeTab = 0;

  function init(rebuild) {
    rebuildFn = rebuild || null;
    buildTabs();
    buildActions();
    buildChanges();
    buildNotes();
  }

  // Called from editor-main's onSelect callback
  function updateSelection(id) {
    var hasSel = !!id;
    for (var i = 0; i < actionButtons.length; i++) {
      actionButtons[i].disabled = !hasSel;
    }
  }

  // ---- Tab bar ----
  function buildTabs() {
    var bar = document.getElementById('qp-tab-bar');
    if (!bar) return;

    pages = [
      document.getElementById('qp-actions-body'),
      document.getElementById('qp-changes-body'),
      document.getElementById('qp-notes-body')
    ];

    var labels = ['Actions', 'Changes', 'Notes'];
    for (var i = 0; i < labels.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'qp-tab';
      btn.textContent = labels[i];
      btn.addEventListener('click', (function(idx) {
        return function() { switchTab(idx); };
      })(i));
      bar.appendChild(btn);
      tabs.push(btn);
    }
    switchTab(0);
  }

  function switchTab(idx) {
    activeTab = idx;
    for (var i = 0; i < tabs.length; i++) {
      if (i === idx) {
        tabs[i].classList.add('active');
        if (pages[i]) pages[i].style.display = '';
      } else {
        tabs[i].classList.remove('active');
        if (pages[i]) pages[i].style.display = 'none';
      }
    }
  }

  // ---- Quick Actions ----
  function buildActions() {
    var body = document.getElementById('qp-actions-body');
    if (!body) return;

    // Always-enabled actions
    var worldBtn = document.createElement('button');
    worldBtn.className = 'qa-btn';
    worldBtn.textContent = 'World Settings';
    worldBtn.addEventListener('click', function() {
      EditorViewport.selectObject(null);
      EditorGizmo.detach();
      EditorPanel.showWorldSettings();
    });
    body.appendChild(worldBtn);

    // Selection-dependent actions
    var actions = [
      { label: 'Duplicate',  fn: doDuplicate },
      { label: 'Delete',     fn: doDelete },
      { label: 'Focus',      fn: doFocus },
      { label: 'Deselect',   fn: doDeselect },
      { label: 'Align Grid', fn: doAlignGrid },
      { label: 'Reset Rot',  fn: doResetRot },
      { label: 'Save Prefab', fn: doSavePrefab }
    ];

    for (var i = 0; i < actions.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'qa-btn';
      btn.textContent = actions[i].label;
      btn.disabled = true;
      btn.addEventListener('click', (function(action) {
        return function() { action.fn(); };
      })(actions[i]));
      body.appendChild(btn);
      actionButtons.push(btn);
    }
  }

  function doDuplicate() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;

    var cloneData = JSON.parse(JSON.stringify(entry.data));
    var type = cloneData.primitive || 'box';
    delete cloneData.id;
    if (cloneData.x !== undefined) cloneData.x = (cloneData.x || 0) + 1;

    var newId = Engine.addObject(type, cloneData);
    if (newId) {
      EditorPalette.refreshHierarchy();
      EditorViewport.selectObject(newId);
    }
  }

  function doDelete() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    Engine.unregister(id);
    EditorViewport.selectObject(null);
    EditorGizmo.detach();
    EditorPanel.showProperties(null);
    EditorPalette.refreshHierarchy();
  }

  function doFocus() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    var d = entry.data;
    // All primitives use center-positioned x/y/z
    EditorViewport.focusOn(new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0));
  }

  function doDeselect() {
    EditorViewport.selectObject(null);
    EditorGizmo.detach();
    EditorPanel.showProperties(null);
    EditorPalette.highlightHierarchy(null);
  }

  function doAlignGrid() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    var d = entry.data;
    if (d.x !== undefined) d.x = EditorGrid.snap(d.x);
    if (d.z !== undefined) d.z = EditorGrid.snap(d.z);
    if (d.y !== undefined) d.y = EditorGrid.snap(d.y);
    var type = d.primitive || 'box';
    if (rebuildFn) rebuildFn(id, type);
    EditorPanel.refresh();
    EditorGizmo.attachTo(id);
  }

  function doSavePrefab() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    var name = prompt('Prefab name:');
    if (!name || !name.trim()) return;
    if (typeof EditorPrefab !== 'undefined') {
      var result = EditorPrefab.saveFromSelection(name.trim());
      if (result) {
        EditorPalette.refreshHierarchy();
      }
    }
  }

  function doResetRot() {
    var id = EditorViewport.getSelectedId();
    if (!id) return;
    var entry = Engine.getEntry(id);
    if (!entry || !entry.data) return;
    var type = entry.data.primitive || 'box';
    var axes = ['rotX', 'rotY', 'rotZ'];
    for (var i = 0; i < axes.length; i++) {
      var key = axes[i];
      var oldVal = entry.data[key] || 0;
      if (oldVal !== 0) {
        entry.data[key] = 0;
        var cmd = EditorHistory.propertyCommand(id, type, key, oldVal, 0, rebuildFn);
        EditorHistory.push(cmd);
      }
    }
    if (rebuildFn) rebuildFn(id, type);
    EditorPanel.refresh();
    EditorGizmo.attachTo(id);
  }

  // ---- Changes: Live history log + Save backups with revert ----

  var changesLog = null;   // div for history entries
  var backupsDiv = null;   // div for save backups

  function buildChanges() {
    changesBody = document.getElementById('qp-changes-body');
    if (!changesBody) return;

    // Backups section (top)
    backupsDiv = document.createElement('div');
    backupsDiv.id = 'changes-backups';
    changesBody.appendChild(backupsDiv);

    // Separator
    var sep = document.createElement('div');
    sep.className = 'rc-section-label';
    sep.textContent = 'Recent Changes';
    changesBody.appendChild(sep);

    // History log section (bottom)
    changesLog = document.createElement('div');
    changesLog.id = 'changes-log';
    changesBody.appendChild(changesLog);

    // Poll history for changes
    setInterval(refreshChanges, 400);
    refreshBackups();
  }

  function refreshChanges() {
    if (!changesLog) return;
    var log = EditorHistory.getLog();
    if (log.length === lastLogLen) return;
    lastLogLen = log.length;

    while (changesLog.firstChild) changesLog.removeChild(changesLog.firstChild);

    // Show most recent first, limit to 20
    var start = Math.max(0, log.length - 20);
    for (var i = log.length - 1; i >= start; i--) {
      var entry = log[i];
      var div = document.createElement('div');
      div.className = 'rc-entry';

      var timeSpan = document.createElement('span');
      timeSpan.className = 'rc-time';
      var d = new Date(entry.time);
      timeSpan.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());

      var labelSpan = document.createElement('span');
      labelSpan.className = 'rc-label';
      labelSpan.textContent = entry.label;

      div.appendChild(timeSpan);
      div.appendChild(labelSpan);
      changesLog.appendChild(div);
    }
  }

  function refreshBackups() {
    if (!backupsDiv) return;
    if (!window._projectUID) {
      while (backupsDiv.firstChild) backupsDiv.removeChild(backupsDiv.firstChild);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/projects/' + window._projectUID + '/backups', true);
    xhr.onload = function() {
      if (xhr.status !== 200) return;
      try {
        var data = JSON.parse(xhr.responseText);
        renderBackups(data.backups || []);
      } catch(e) {}
    };
    xhr.send();
  }

  function renderBackups(backups) {
    while (backupsDiv.firstChild) backupsDiv.removeChild(backupsDiv.firstChild);

    var header = document.createElement('div');
    header.className = 'rc-section-label';
    header.textContent = 'Saves (' + backups.length + '/5)';
    backupsDiv.appendChild(header);

    if (backups.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'rc-empty';
      empty.textContent = 'No saves yet.';
      backupsDiv.appendChild(empty);
      return;
    }

    for (var i = 0; i < backups.length; i++) {
      (function(backup, idx) {
        var div = document.createElement('div');
        div.className = 'rc-entry rc-save';

        var timeSpan = document.createElement('span');
        timeSpan.className = 'rc-time';
        var d = new Date(backup.timestamp);
        timeSpan.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());

        var dateSpan = document.createElement('span');
        dateSpan.className = 'rc-label';
        dateSpan.textContent = d.toLocaleDateString();

        var revertBtn = document.createElement('button');
        revertBtn.className = 'rc-revert';
        revertBtn.textContent = 'Revert';
        revertBtn.title = 'Revert to this save';
        revertBtn.addEventListener('click', function() {
          if (!confirm('Revert to save from ' + d.toLocaleString() + '? Current scene will be backed up.')) return;
          var xhr2 = new XMLHttpRequest();
          xhr2.open('POST', '/api/projects/' + window._projectUID + '/backups/' + idx + '/revert', true);
          xhr2.setRequestHeader('Content-Type', 'application/json');
          xhr2.onload = function() {
            if (xhr2.status === 200) {
              window.location.reload();
            }
          };
          xhr2.send('{}');
        });

        div.appendChild(timeSpan);
        div.appendChild(dateSpan);
        div.appendChild(revertBtn);
        backupsDiv.appendChild(div);
      })(backups[i], i);
    }
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // ---- Notes/TODO ----
  function buildNotes() {
    var body = document.getElementById('qp-notes-body');
    if (!body) return;

    notesTextarea = document.createElement('textarea');
    notesTextarea.placeholder = 'Notes, TODOs, reminders...';
    notesTextarea.value = localStorage.getItem('editor-notes') || '';
    body.appendChild(notesTextarea);

    notesTextarea.addEventListener('input', function() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        localStorage.setItem('editor-notes', notesTextarea.value);
      }, 500);
    });
  }

  return {
    init: init,
    updateSelection: updateSelection,
    refreshBackups: refreshBackups
  };
})();
