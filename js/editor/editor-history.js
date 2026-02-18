// ============================================================
// EDITOR-HISTORY — Undo/redo command stack (command pattern)
// ============================================================

var EditorHistory = (function() {
  'use strict';

  var undoStack = [];
  var redoStack = [];
  var MAX_ENTRIES = 100;
  var log = [];
  var MAX_LOG = 50;
  var changeCallback = null;

  function onPush(fn) { changeCallback = fn; }

  function push(command) {
    undoStack.push(command);
    if (undoStack.length > MAX_ENTRIES) undoStack.shift();
    redoStack = [];
    log.push({ label: command.label || '?', time: Date.now() });
    if (log.length > MAX_LOG) log.shift();
    if (changeCallback) changeCallback();
  }

  function undo() {
    if (undoStack.length === 0) return;
    var cmd = undoStack.pop();
    cmd.undo();
    redoStack.push(cmd);
  }

  function redo() {
    if (redoStack.length === 0) return;
    var cmd = redoStack.pop();
    cmd.execute();
    undoStack.push(cmd);
  }

  function clear() {
    undoStack = [];
    redoStack = [];
  }

  // --- Command factories ---

  // Property change command
  function propertyCommand(id, type, key, oldVal, newVal, rebuildFn) {
    return {
      label: id + '.' + key + ' \u2192 ' + newVal,
      execute: function() {
        var entry = Engine.getEntry(id);
        if (entry) {
          entry.data[key] = newVal;
          if (rebuildFn) rebuildFn(id, type);
        }
      },
      undo: function() {
        var entry = Engine.getEntry(id);
        if (entry) {
          entry.data[key] = oldVal;
          if (rebuildFn) rebuildFn(id, type);
        }
      }
    };
  }

  // Move command
  function moveCommand(id, oldX, oldZ, newX, newZ) {
    return {
      label: id + ' moved',
      execute: function() {
        var entry = Engine.getEntry(id);
        if (entry) {
          entry.data.x = newX;
          entry.data.z = newZ;
          if (entry.meshGroup) {
            entry.meshGroup.position.set(0, 0, 0); // reset since position is baked into children
          }
        }
      },
      undo: function() {
        var entry = Engine.getEntry(id);
        if (entry) {
          entry.data.x = oldX;
          entry.data.z = oldZ;
        }
      }
    };
  }

  // Add object command
  function addCommand(type, data, addFn, removeFn) {
    return {
      execute: function() {
        addFn(data);
      },
      undo: function() {
        removeFn(data.id);
      }
    };
  }

  // Remove object command
  function removeCommand(id, type, data, addFn, removeFn) {
    return {
      execute: function() {
        removeFn(id);
      },
      undo: function() {
        addFn(data);
      }
    };
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }
  function getLog() { return log; }

  return {
    push: push,
    undo: undo,
    redo: redo,
    clear: clear,
    onPush: onPush,
    propertyCommand: propertyCommand,
    moveCommand: moveCommand,
    addCommand: addCommand,
    removeCommand: removeCommand,
    canUndo: canUndo,
    canRedo: canRedo,
    getLog: getLog
  };
})();
