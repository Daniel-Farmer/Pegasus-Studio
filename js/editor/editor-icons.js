// ============================================================
// EDITOR-ICONS — Inline SVG liner icons for editor UI
// All icons are 18x18 viewBox, stroke-only, uses currentColor
// ============================================================

var EditorIcons = (function() {
  'use strict';

  var icons = {

    // --- Primitives ---
    box: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M9 2L15.5 5.5V12.5L9 16L2.5 12.5V5.5L9 2Z"/><path d="M2.5 5.5L9 9M9 9L15.5 5.5M9 9V16"/></svg>',

    cylinder: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><ellipse cx="9" cy="4" rx="5.5" ry="2.2"/><path d="M3.5 4V13.5C3.5 14.71 5.96 15.7 9 15.7S14.5 14.71 14.5 13.5V4"/><path d="M3.5 13.5C3.5 14.71 5.96 15.7 9 15.7S14.5 14.71 14.5 13.5" stroke-dasharray="0"/></svg>',

    plane: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 13L7 4H16L11 13H2Z"/><path d="M7 4L2 13" opacity="0.4"/></svg>',

    sphere: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="9" r="7"/><ellipse cx="9" cy="9" rx="3" ry="7" stroke-width="1" opacity="0.45"/><path d="M2.2 9H15.8" stroke-width="1" opacity="0.45"/></svg>',

    cone: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2L3.5 14H14.5L9 2Z"/><ellipse cx="9" cy="14" rx="5.5" ry="2" stroke-dasharray="2.5 2"/></svg>',

    wedge: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3 14H15V4L3 14Z"/><path d="M3 14V14" stroke-linecap="round"/></svg>',

    torus: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><ellipse cx="9" cy="9" rx="7" ry="4"/><ellipse cx="9" cy="9" rx="3" ry="1.2" stroke-dasharray="2 1.5"/></svg>',

    stairs: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16H6V12H10V8H14V4H16"/><path d="M2 16V12H6" opacity="0.4"/><path d="M6 12V8H10" opacity="0.4"/><path d="M10 8V4H14" opacity="0.4"/></svg>',

    terrain: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 15L5 7L8 11L11 5L17 15H1Z"/><path d="M5 7L7 10" opacity="0.4"/></svg>',

    road: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15L8 3H10L15 15"/><path d="M5 10H13" stroke-dasharray="2 1.5"/><path d="M4 13H14"/></svg>',

    empty: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="9" cy="9" r="2.2"/><path d="M9 2V5.5M9 12.5V16M2 9H5.5M12.5 9H16"/></svg>',

    // --- Behaviors ---
    collision: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="3" width="12" height="12" rx="1.5" stroke-dasharray="3.5 2"/></svg>',

    light: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.5 12H11.5"/><path d="M7 14H11"/><circle cx="9" cy="7.5" r="3.8"/><path d="M9 1.5V2.5M2 7.5H3M15 7.5H16M4 3L5 4M14 3L13 4" stroke-width="1.3"/></svg>',

    sound: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V11H5.5L9.5 14V4L5.5 7H3Z"/><path d="M12.5 6.5C13.3 7.3 13.8 8.4 13.8 9.5S13.3 11.7 12.5 12.5"/><path d="M14.5 4.5C16 6 16.8 7.7 16.8 9.5S16 13 14.5 14.5"/></svg>',

    model: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M9 1.5L16 5.5V12.5L9 16.5L2 12.5V5.5L9 1.5Z"/><path d="M2 5.5L9 9.5L16 5.5" stroke-width="1.1"/><path d="M9 9.5V16.5" stroke-width="1.1"/></svg>',

    spawn: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="9" cy="4.5" r="2.5"/><path d="M4.5 16V12.5C4.5 10 6.5 8 9 8S13.5 10 13.5 12.5V16"/></svg>',

    npc: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="4.5" r="2.3"/><path d="M3 15V12C3 10 4.8 8.2 7 8.2S11 10 11 12V15"/><path d="M12.5 7L15.5 10L12.5 13" stroke-width="1.5"/></svg>',

    interactable: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2V9L12 10.5L11 14H7L6 10.5L4 9.5"/><path d="M6 6L4 4.5"/><path d="M13 6L15 4.5"/><circle cx="9.5" cy="9" r="0.5" fill="currentColor" stroke="none"/></svg>',

    // --- Presets / Prefabs ---
    preset: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2" y="2" width="5.5" height="5.5" rx="1"/><rect x="10.5" y="2" width="5.5" height="5.5" rx="1"/><rect x="2" y="10.5" width="5.5" height="5.5" rx="1"/><rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1"/></svg>',

    prefab: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.5" y="2.5" width="13" height="13" rx="1.5"/><path d="M6.5 2.5V15.5M2.5 6.5H15.5" stroke-width="1" opacity="0.35"/><circle cx="11" cy="11" r="2.5" stroke-width="1.3"/></svg>',

    folder: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 5V14.5C2 15.05 2.45 15.5 3 15.5H15C15.55 15.5 16 15.05 16 14.5V7C16 6.45 15.55 6 15 6H9L7.5 3.5H3C2.45 3.5 2 3.95 2 4.5V5Z"/></svg>',

    folderOpen: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 14.5V4.5C2 3.95 2.45 3.5 3 3.5H7.5L9 6H15C15.55 6 16 6.45 16 7V8"/><path d="M2.5 15.5H14.5L16.5 9H4.5L2.5 15.5Z"/></svg>'
  };

  function get(name) {
    return icons[name] || '';
  }

  function has(name) {
    return !!icons[name];
  }

  return {
    get: get,
    has: has
  };
})();
