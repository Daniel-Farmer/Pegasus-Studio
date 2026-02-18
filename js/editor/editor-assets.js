// ============================================================
// EDITOR-ASSETS — 3D model asset library browser & picker modal
// ============================================================

var EditorAssets = (function() {
  'use strict';

  var catalog = null;
  var categories = [];
  var modalEl = null;
  var activeCategory = null;
  var searchQuery = '';

  function init() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'models/catalog.json', true);
    xhr.responseType = 'text';
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          catalog = data.models || [];
          buildCategoryList();
          buildModal();
          console.log('[EditorAssets] Loaded catalog:', catalog.length, 'models');
          // Rebuild palette to inject asset section now that catalog is ready
          if (typeof EditorPalette !== 'undefined' && EditorPalette.buildPaletteUI) {
            EditorPalette.buildPaletteUI();
          }
        } catch(e) {
          console.warn('[EditorAssets] Failed to parse catalog:', e);
        }
      } else {
        console.warn('[EditorAssets] catalog.json not found (status ' + xhr.status + ')');
      }
    };
    xhr.onerror = function() {
      console.warn('[EditorAssets] Network error loading catalog');
    };
    xhr.send();
  }

  function buildCategoryList() {
    if (!catalog) return;
    var catSet = {};
    for (var i = 0; i < catalog.length; i++) {
      catSet[catalog[i].category] = true;
    }
    categories = [];
    for (var c in catSet) categories.push(c);
    categories.sort();
  }

  function buildModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'pm-overlay asset-overlay';
    modalEl.style.display = 'none';

    var dialog = document.createElement('div');
    dialog.className = 'pm-dialog asset-dialog';

    // Header
    var header = document.createElement('div');
    header.className = 'pm-header';
    var title = document.createElement('span');
    title.className = 'pm-title';
    title.textContent = 'Asset Library';
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'pm-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', hide);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'pm-body asset-body';

    // Search input
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'asset-search';
    searchInput.placeholder = 'Search models...';
    searchInput.addEventListener('input', function() {
      searchQuery = this.value.toLowerCase();
      populateGrid();
    });
    body.appendChild(searchInput);

    // Category filter bar
    var filterBar = document.createElement('div');
    filterBar.className = 'tex-filter-bar';
    body.appendChild(filterBar);

    // Asset grid
    var grid = document.createElement('div');
    grid.className = 'tex-grid asset-grid';
    body.appendChild(grid);

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
    var grid = modalEl.querySelector('.asset-grid');

    // Rebuild filter buttons — safe DOM methods only
    while (filterBar.firstChild) filterBar.removeChild(filterBar.firstChild);

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

    // Rebuild grid — safe DOM methods only
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    for (var i = 0; i < catalog.length; i++) {
      var asset = catalog[i];
      if (activeCategory && asset.category !== activeCategory) continue;
      if (searchQuery && asset.name.toLowerCase().indexOf(searchQuery) === -1 &&
          asset.category.toLowerCase().indexOf(searchQuery) === -1) continue;

      var card = document.createElement('div');
      card.className = 'tex-card asset-card';
      card.title = asset.name + ' (' + asset.category + ')';
      card.setAttribute('draggable', 'true');

      // Colored category badge + model name
      var colorMap = {
        'Buildings': '#5577aa', 'Nature': '#55aa55', 'Furniture': '#aa8855',
        'Vehicles': '#aa5555', 'Medieval': '#8855aa', 'Adventure': '#55aaaa',
        'Other': '#888888'
      };
      var iconArea = document.createElement('div');
      iconArea.className = 'asset-icon';
      iconArea.style.borderLeft = '3px solid ' + (colorMap[asset.category] || '#888');

      var catTag = document.createElement('span');
      catTag.className = 'asset-cat-tag';
      catTag.textContent = asset.category;
      catTag.style.color = colorMap[asset.category] || '#888';
      iconArea.appendChild(catTag);

      var iconLabel = document.createElement('span');
      iconLabel.className = 'asset-icon-name';
      iconLabel.textContent = asset.name;
      iconArea.appendChild(iconLabel);

      card.appendChild(iconArea);

      // Drag start — set asset data for canvas drop
      (function(a) {
        card.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('application/x-asset', JSON.stringify(a));
          e.dataTransfer.effectAllowed = 'copy';
        });
      })(asset);

      // Click — enter placement mode
      (function(a) {
        card.addEventListener('click', function() {
          if (typeof EditorPalette !== 'undefined') {
            EditorPalette.setPlacementMode({
              type: 'empty', label: a.name, defaults: {},
              tag: a.name,
              behaviors: [{ type: 'model', url: a.file, scale: 1, castShadow: true }]
            });
          }
          hide();
        });
      })(asset);

      grid.appendChild(card);
    }
  }

  function show(category) {
    if (!modalEl || !catalog) {
      console.warn('[EditorAssets] Catalog not loaded yet');
      return;
    }
    activeCategory = category || null;
    searchQuery = '';
    var searchInput = modalEl.querySelector('.asset-search');
    if (searchInput) searchInput.value = '';
    populateGrid();
    modalEl.style.display = 'flex';
  }

  function hide() {
    if (modalEl) modalEl.style.display = 'none';
  }

  function isLoaded() {
    return catalog !== null;
  }

  function getCatalog() {
    return catalog;
  }

  function getCategories() {
    return categories;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    isLoaded: isLoaded,
    getCatalog: getCatalog,
    getCategories: getCategories
  };
})();
