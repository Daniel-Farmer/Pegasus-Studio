// ============================================================
// EDITOR-TEXTURES — Texture catalog browser & picker modal
// ============================================================

var EditorTextures = (function() {
  'use strict';

  var catalog = null;
  var categories = [];
  var modalEl = null;
  var pickCallback = null;
  var pickFieldKey = null;
  var activeCategory = null;

  function init() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'textures/catalog.json', true);
    xhr.responseType = 'text';
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          catalog = JSON.parse(xhr.responseText);
          buildCategoryList();
          buildModal();
          console.log('[EditorTextures] Loaded catalog:', catalog.textures.length, 'textures');
        } catch(e) {
          console.warn('[EditorTextures] Failed to parse catalog:', e);
        }
      } else {
        console.warn('[EditorTextures] catalog.json not found (status ' + xhr.status + ')');
      }
    };
    xhr.onerror = function() {
      console.warn('[EditorTextures] Network error loading catalog');
    };
    xhr.send();
  }

  function buildCategoryList() {
    if (!catalog || !catalog.textures) return;
    var catSet = {};
    for (var i = 0; i < catalog.textures.length; i++) {
      catSet[catalog.textures[i].category] = true;
    }
    categories = [];
    for (var c in catSet) categories.push(c);
    categories.sort();
  }

  function buildModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'pm-overlay tex-overlay';
    modalEl.style.display = 'none';

    var dialog = document.createElement('div');
    dialog.className = 'pm-dialog tex-dialog';

    // Header
    var header = document.createElement('div');
    header.className = 'pm-header';
    var title = document.createElement('span');
    title.className = 'pm-title';
    title.textContent = 'Texture Library';
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'pm-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', hide);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'pm-body tex-body';

    // Category filter bar
    var filterBar = document.createElement('div');
    filterBar.className = 'tex-filter-bar';
    body.appendChild(filterBar);

    // Texture grid
    var grid = document.createElement('div');
    grid.className = 'tex-grid';
    body.appendChild(grid);

    // Clear texture button
    var clearBtn = document.createElement('button');
    clearBtn.className = 'pm-btn tex-clear-btn';
    clearBtn.textContent = 'Clear Texture';
    clearBtn.addEventListener('click', function() {
      if (pickCallback) pickCallback(null);
      hide();
    });
    body.appendChild(clearBtn);

    dialog.appendChild(body);
    modalEl.appendChild(dialog);

    // Click overlay to close
    modalEl.addEventListener('click', function(e) {
      if (e.target === modalEl) hide();
    });

    document.body.appendChild(modalEl);
  }

  function populateGrid() {
    if (!modalEl || !catalog) return;

    var filterBar = modalEl.querySelector('.tex-filter-bar');
    var grid = modalEl.querySelector('.tex-grid');

    // Rebuild filter buttons
    filterBar.innerHTML = '';
    var allBtn = document.createElement('button');
    allBtn.className = 'face-btn' + (activeCategory === null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', function() {
      activeCategory = null;
      populateGrid();
    });
    filterBar.appendChild(allBtn);

    for (var ci = 0; ci < categories.length; ci++) {
      var catBtn = document.createElement('button');
      catBtn.className = 'face-btn' + (categories[ci] === activeCategory ? ' active' : '');
      catBtn.textContent = categories[ci];
      (function(cat) {
        catBtn.addEventListener('click', function() {
          activeCategory = cat;
          populateGrid();
        });
      })(categories[ci]);
      filterBar.appendChild(catBtn);
    }

    // Rebuild grid
    grid.innerHTML = '';
    var textures = catalog.textures;

    for (var i = 0; i < textures.length; i++) {
      var tex = textures[i];
      if (activeCategory && tex.category !== activeCategory) continue;

      var card = document.createElement('div');
      card.className = 'tex-card';
      card.title = tex.name + ' (' + tex.category + ')';

      var thumb = document.createElement('div');
      thumb.className = 'tex-thumb';
      thumb.style.backgroundImage = 'url(' + tex.color + ')';
      card.appendChild(thumb);

      var label = document.createElement('div');
      label.className = 'tex-label';
      label.textContent = tex.name;
      card.appendChild(label);

      (function(texEntry) {
        card.addEventListener('click', function() {
          if (pickCallback) pickCallback(texEntry);
          hide();
        });
      })(tex);

      grid.appendChild(card);
    }
  }

  function show(fieldKey, callback) {
    if (!modalEl || !catalog) {
      console.warn('[EditorTextures] Catalog not loaded yet');
      if (callback) callback(null);
      return;
    }
    pickFieldKey = fieldKey || 'map';
    pickCallback = callback;
    activeCategory = null;
    populateGrid();
    modalEl.style.display = 'flex';
  }

  function hide() {
    if (modalEl) modalEl.style.display = 'none';
    pickCallback = null;
    pickFieldKey = null;
  }

  function isLoaded() {
    return catalog !== null;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    isLoaded: isLoaded
  };
})();
