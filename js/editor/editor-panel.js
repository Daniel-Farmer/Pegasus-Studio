// ============================================================
// EDITOR-PANEL — Tabbed property inspector
//   Tabs: Transform | Faces | Behaviors | Scripts
// ============================================================

var EditorPanel = (function() {
  'use strict';

  var propsBody = null;
  var propsTitle = null;
  var propsEmpty = null;
  var currentId = null;
  var currentType = null;
  var onChangeCallback = null;
  var activeTab = 'transform';

  function init() {
    propsBody = document.getElementById('props-body');
    propsTitle = document.getElementById('props-title');
    propsEmpty = document.getElementById('props-empty');
  }

  function showProperties(id) {
    currentId = id;
    propsBody.innerHTML = '';

    if (!id) {
      propsTitle.textContent = 'No selection';
      if (propsEmpty) propsEmpty.style.display = 'block';
      return;
    }
    if (propsEmpty) propsEmpty.style.display = 'none';

    var entry = Engine.getEntry(id);
    if (!entry) {
      propsTitle.textContent = 'Unknown: ' + id;
      return;
    }

    currentType = entry.data.primitive || 'box';
    var schema = SceneSchema.TYPES[currentType];
    if (!schema) {
      propsTitle.textContent = id;
      propsBody.innerHTML = '<pre style="color:#888;font-size:11px;white-space:pre-wrap;">' + JSON.stringify(entry.data, null, 2) + '</pre>';
      return;
    }

    propsTitle.textContent = (entry.data.tag || currentType) + ' (' + id + ')';

    // Build tabs
    var tabBar = document.createElement('div');
    tabBar.className = 'prop-tabs';

    var tabs = ['transform', 'faces', 'behaviors', 'scripts'];
    var tabLabels = { transform: 'Transform', faces: 'Faces', behaviors: 'Behaviors', scripts: 'Scripts' };

    // Hide faces tab for empty type
    if (currentType === 'empty') {
      tabs = ['transform', 'behaviors', 'scripts'];
    }

    for (var ti = 0; ti < tabs.length; ti++) {
      var tab = document.createElement('div');
      tab.className = 'prop-tab' + (tabs[ti] === activeTab ? ' active' : '');
      tab.textContent = tabLabels[tabs[ti]];
      tab.setAttribute('data-tab', tabs[ti]);
      (function(tabName) {
        tab.addEventListener('click', function() {
          activeTab = tabName;
          showProperties(currentId);
        });
      })(tabs[ti]);
      tabBar.appendChild(tab);
    }
    propsBody.appendChild(tabBar);

    // Fix activeTab if it's not in the available tabs
    if (tabs.indexOf(activeTab) === -1) activeTab = 'transform';

    var tabBody = document.createElement('div');
    tabBody.className = 'prop-tab-body active';
    propsBody.appendChild(tabBody);

    if (activeTab === 'transform') {
      renderTransformTab(tabBody, schema, entry.data);
    } else if (activeTab === 'faces') {
      renderFacesTab(tabBody, entry.data);
    } else if (activeTab === 'behaviors') {
      renderBehaviorsTab(tabBody, entry.data);
    } else if (activeTab === 'scripts') {
      renderScriptsTab(tabBody, entry.data);
    }
  }

  // --- Transform Tab ---
  function renderTransformTab(container, schema, data) {
    for (var i = 0; i < schema.fields.length; i++) {
      var field = schema.fields[i];
      if (field.showIf && !field.showIf(data)) continue;
      var value = data[field.key];
      if (value === undefined) value = '';
      createFieldRow(container, field, value, data);
    }
  }

  // --- Faces Tab ---
  function renderFacesTab(container, data) {
    var faceKeys = SceneSchema.getFaceKeys(data.primitive);
    if (!faceKeys || faceKeys.length === 0) {
      container.textContent = 'No faces for this primitive.';
      return;
    }

    if (!data.faces) data.faces = {};

    // Face selector buttons
    var faceSel = document.createElement('div');
    faceSel.className = 'face-selector';

    var currentFace = faceSel._activeFace || faceKeys[0];

    for (var fi = 0; fi < faceKeys.length; fi++) {
      var fBtn = document.createElement('button');
      fBtn.className = 'face-btn' + (faceKeys[fi] === currentFace ? ' active' : '');
      fBtn.textContent = faceKeys[fi];
      (function(fk) {
        fBtn.addEventListener('click', function() {
          // Re-render with this face selected
          container.innerHTML = '';
          container._activeFace = fk;
          renderFacesTabInner(container, data, fk);
        });
      })(faceKeys[fi]);
      faceSel.appendChild(fBtn);
    }
    container.appendChild(faceSel);

    renderFacesTabInner(container, data, currentFace);
  }

  function renderFacesTabInner(container, data, faceName) {
    // Re-render face selector
    var oldSel = container.querySelector('.face-selector');
    if (!oldSel) {
      var faceKeys = SceneSchema.getFaceKeys(data.primitive);
      var faceSel = document.createElement('div');
      faceSel.className = 'face-selector';
      for (var fi = 0; fi < faceKeys.length; fi++) {
        var fBtn = document.createElement('button');
        fBtn.className = 'face-btn' + (faceKeys[fi] === faceName ? ' active' : '');
        fBtn.textContent = faceKeys[fi];
        (function(fk) {
          fBtn.addEventListener('click', function() {
            container.innerHTML = '';
            renderFacesTabInner(container, data, fk);
          });
        })(faceKeys[fi]);
        faceSel.appendChild(fBtn);
      }
      container.appendChild(faceSel);
    } else {
      // Update active state
      var btns = oldSel.querySelectorAll('.face-btn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].classList.toggle('active', btns[b].textContent === faceName);
      }
    }

    // Remove old fields container
    var oldFields = container.querySelector('.face-fields');
    if (oldFields) oldFields.remove();

    // Remove old preset button
    var oldPresetBtn = container.querySelector('.preset-apply-btn');
    if (oldPresetBtn) oldPresetBtn.remove();

    // "Apply Preset..." button
    if (typeof EditorPresets !== 'undefined') {
      var presetBtn = document.createElement('button');
      presetBtn.className = 'preset-apply-btn';
      presetBtn.textContent = 'Apply Preset...';
      (function(fName) {
        presetBtn.addEventListener('click', function() {
          showPresetPicker(data, fName, function() {
            if (onChangeCallback) {
              onChangeCallback(currentId, currentType, 'faces.' + fName, null, data.faces[fName]);
            }
            // Re-render face fields using DOM removal + rebuild
            while (container.firstChild) container.removeChild(container.firstChild);
            renderFacesTabInner(container, data, fName);
          });
        });
      })(faceName);
      container.appendChild(presetBtn);
    }

    var fieldsDiv = document.createElement('div');
    fieldsDiv.className = 'face-fields';

    if (!data.faces) data.faces = {};
    if (!data.faces[faceName]) data.faces[faceName] = {};
    var faceData = data.faces[faceName];

    var schema = SceneSchema.FACE_MATERIAL_SCHEMA;
    for (var i = 0; i < schema.length; i++) {
      var field = schema[i];
      var value = faceData[field.key];
      if (value === undefined) value = '';

      var row = document.createElement('div');
      row.className = 'prop-row';

      var label = document.createElement('div');
      label.className = 'prop-label';
      label.textContent = field.label;
      row.appendChild(label);

      var inputWrap = document.createElement('div');
      inputWrap.className = 'prop-input';

      if (field.type === 'texture') {
        // --- Texture field: preview + text input + browse + clear ---
        var texWrap = document.createElement('div');
        texWrap.className = 'tex-input-wrap';

        var preview = document.createElement('div');
        preview.className = 'tex-input-preview';
        if (value) preview.style.backgroundImage = 'url(' + value + ')';
        texWrap.appendChild(preview);

        var input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.placeholder = 'URL or browse...';
        texWrap.appendChild(input);

        var browseBtn = document.createElement('button');
        browseBtn.className = 'tex-browse-btn';
        browseBtn.textContent = '...';
        browseBtn.title = 'Browse textures';
        texWrap.appendChild(browseBtn);

        var clearBtn = document.createElement('button');
        clearBtn.className = 'tex-clear-input-btn';
        clearBtn.textContent = '\u00D7';
        clearBtn.title = 'Clear';
        texWrap.appendChild(clearBtn);

        inputWrap.appendChild(texWrap);

        (function(fld, inp, prevEl, fData, fName, cBtn, bBtn) {
          inp.addEventListener('change', function() {
            var newVal = inp.value;
            fData[fld.key] = newVal;
            prevEl.style.backgroundImage = newVal ? 'url(' + newVal + ')' : 'none';
            if (onChangeCallback) {
              onChangeCallback(currentId, currentType, 'faces.' + fName + '.' + fld.key, null, newVal);
            }
          });

          bBtn.addEventListener('click', function() {
            if (typeof EditorTextures === 'undefined' || !EditorTextures.isLoaded()) {
              alert('Texture catalog not loaded.');
              return;
            }
            EditorTextures.show(fld.key, function(texEntry) {
              if (texEntry === null) {
                inp.value = '';
                fData[fld.key] = '';
                prevEl.style.backgroundImage = 'none';
                if (onChangeCallback) {
                  onChangeCallback(currentId, currentType, 'faces.' + fName + '.' + fld.key, null, '');
                }
                return;
              }
              var urlMap = { map: 'color', normalMap: 'normal', roughnessMap: 'roughness' };
              var urlKey = urlMap[fld.key] || 'color';
              var newVal = texEntry[urlKey] || '';
              inp.value = newVal;
              fData[fld.key] = newVal;
              prevEl.style.backgroundImage = newVal ? 'url(' + newVal + ')' : 'none';
              if (onChangeCallback) {
                onChangeCallback(currentId, currentType, 'faces.' + fName + '.' + fld.key, null, newVal);
              }
              // Auto-fill sibling maps when picking for 'map'
              if (fld.key === 'map') {
                if (texEntry.normal && !fData.normalMap) {
                  fData.normalMap = texEntry.normal;
                  if (onChangeCallback) onChangeCallback(currentId, currentType, 'faces.' + fName + '.normalMap', null, texEntry.normal);
                }
                if (texEntry.roughness && !fData.roughnessMap) {
                  fData.roughnessMap = texEntry.roughness;
                  if (onChangeCallback) onChangeCallback(currentId, currentType, 'faces.' + fName + '.roughnessMap', null, texEntry.roughness);
                }
                // Re-render to show updated sibling fields
                container.innerHTML = '';
                renderFacesTabInner(container, data, fName);
              }
            });
          });

          cBtn.addEventListener('click', function() {
            inp.value = '';
            fData[fld.key] = '';
            prevEl.style.backgroundImage = 'none';
            if (onChangeCallback) {
              onChangeCallback(currentId, currentType, 'faces.' + fName + '.' + fld.key, null, '');
            }
          });
        })(field, input, preview, faceData, faceName, clearBtn, browseBtn);

      } else {
        // --- All other field types (existing behavior) ---
        var input = createInput(field, value);
        (function(fld, inp, fData, fName) {
          inp.addEventListener('change', function() {
            var newVal = parseInputValue(fld.type, fld.key, inp);
            fData[fld.key] = newVal;
            if (onChangeCallback) {
              onChangeCallback(currentId, currentType, 'faces.' + fName + '.' + fld.key, null, newVal);
            }
          });
        })(field, input, faceData, faceName);
        inputWrap.appendChild(input);
      }

      row.appendChild(inputWrap);
      fieldsDiv.appendChild(row);
    }

    // "Copy to all faces" button
    var copyBtn = document.createElement('button');
    copyBtn.className = 'behavior-add';
    copyBtn.textContent = 'Copy to all faces';
    copyBtn.style.marginTop = '8px';
    copyBtn.addEventListener('click', function() {
      var faceKeys = SceneSchema.getFaceKeys(data.primitive);
      var src = JSON.parse(JSON.stringify(faceData));
      for (var fi = 0; fi < faceKeys.length; fi++) {
        data.faces[faceKeys[fi]] = JSON.parse(JSON.stringify(src));
      }
      if (onChangeCallback) {
        onChangeCallback(currentId, currentType, 'faces', null, data.faces);
      }
    });
    fieldsDiv.appendChild(copyBtn);

    container.appendChild(fieldsDiv);
  }

  // --- Behaviors Tab ---
  function renderBehaviorsTab(container, data) {
    if (!data.behaviors) data.behaviors = [];

    for (var bi = 0; bi < data.behaviors.length; bi++) {
      renderBehaviorItem(container, data, bi);
    }

    // Add behavior dropdown
    var addRow = document.createElement('div');
    addRow.style.marginTop = '8px';

    var select = document.createElement('select');
    select.className = 'behavior-add-select';
    var availBeh = SceneSchema.getAvailableBehaviors();
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Add Behavior...';
    select.appendChild(opt0);
    for (var ai = 0; ai < availBeh.length; ai++) {
      var schema = SceneSchema.getBehaviorSchema(availBeh[ai]);
      var opt = document.createElement('option');
      opt.value = availBeh[ai];
      opt.textContent = schema.label;
      select.appendChild(opt);
    }
    select.addEventListener('change', function() {
      var type = this.value;
      if (!type) return;
      var schema = SceneSchema.getBehaviorSchema(type);
      var beh = { type: type };
      if (schema.defaults) {
        for (var k in schema.defaults) beh[k] = schema.defaults[k];
      }
      data.behaviors.push(beh);
      this.value = '';
      if (onChangeCallback) {
        onChangeCallback(currentId, currentType, 'behaviors', null, data.behaviors);
      }
      showProperties(currentId);
    });
    addRow.appendChild(select);
    container.appendChild(addRow);
  }

  function renderBehaviorItem(container, data, index) {
    var beh = data.behaviors[index];
    var schema = SceneSchema.getBehaviorSchema(beh.type);
    if (!schema) return;

    var item = document.createElement('div');
    item.className = 'behavior-item';

    var header = document.createElement('div');
    header.className = 'behavior-header';

    var title = document.createElement('span');
    title.className = 'behavior-type';
    if (EditorIcons.has(beh.type)) {
      var iconSpan = document.createElement('span');
      iconSpan.className = 'behavior-icon';
      iconSpan.innerHTML = EditorIcons.get(beh.type);
      title.appendChild(iconSpan);
      title.appendChild(document.createTextNode(' ' + schema.label));
    } else {
      title.textContent = schema.label;
    }
    header.appendChild(title);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'behavior-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove behavior';
    (function(idx) {
      removeBtn.addEventListener('click', function() {
        data.behaviors.splice(idx, 1);
        if (onChangeCallback) {
          onChangeCallback(currentId, currentType, 'behaviors', null, data.behaviors);
        }
        showProperties(currentId);
      });
    })(index);
    header.appendChild(removeBtn);
    item.appendChild(header);

    // Behavior fields
    if (schema.fields && schema.fields.length > 0) {
      var fieldsDiv = document.createElement('div');
      fieldsDiv.className = 'behavior-fields';

      for (var fi = 0; fi < schema.fields.length; fi++) {
        var field = schema.fields[fi];
        var value = beh[field.key];
        if (value === undefined) value = '';

        var row = document.createElement('div');
        row.className = 'prop-row';

        var label = document.createElement('div');
        label.className = 'prop-label';
        label.textContent = field.label;
        row.appendChild(label);

        var inputWrap = document.createElement('div');
        inputWrap.className = 'prop-input';

        var input = createInput(field, value);
        (function(fld, inp, behRef) {
          inp.addEventListener('change', function() {
            var newVal = parseInputValue(fld.type, fld.key, inp);
            behRef[fld.key] = newVal;
            if (onChangeCallback) {
              onChangeCallback(currentId, currentType, 'behaviors', null, data.behaviors);
            }
          });
        })(field, input, beh);

        inputWrap.appendChild(input);
        row.appendChild(inputWrap);
        fieldsDiv.appendChild(row);
      }
      item.appendChild(fieldsDiv);
    }

    container.appendChild(item);
  }

  // --- Scripts Tab ---
  function renderScriptsTab(container, data) {
    if (typeof EditorScripts !== 'undefined') {
      EditorScripts.render(container, data, function() {
        if (onChangeCallback) onChangeCallback(currentId, currentType, 'scripts', null, data.scripts);
      });
    } else {
      container.textContent = 'Scripts module not loaded.';
    }
  }

  // --- Shared input creation ---
  function createFieldRow(container, field, value, data) {
    if (field.type === 'scripts') return; // handled by scripts tab

    var row = document.createElement('div');
    row.className = 'prop-row';

    var label = document.createElement('div');
    label.className = 'prop-label';
    label.textContent = field.label;
    row.appendChild(label);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'prop-input';

    var input = createInput(field, value);

    if (field.readOnly) {
      input.disabled = true;
      input.style.opacity = '0.6';
    }

    if (!field.readOnly) {
      var fieldKey = field.key;
      var fieldType = field.type;
      input.addEventListener('change', function() {
        var newVal = parseInputValue(fieldType, fieldKey, this);
        var oldVal = data[fieldKey];
        data[fieldKey] = newVal;
        if (onChangeCallback) {
          onChangeCallback(currentId, currentType, fieldKey, oldVal, newVal);
        }
      });
    }

    inputWrap.appendChild(input);
    row.appendChild(inputWrap);
    container.appendChild(row);
  }

  function createInput(field, value) {
    var input;
    if (field.type === 'select') {
      input = document.createElement('select');
      var opts = field.options || [];
      for (var oi = 0; oi < opts.length; oi++) {
        var opt = document.createElement('option');
        opt.value = opts[oi];
        opt.textContent = opts[oi] || '(none)';
        if (String(opts[oi]) === String(value)) opt.selected = true;
        input.appendChild(opt);
      }
    } else if (field.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!value;
    } else if (field.type === 'color') {
      input = document.createElement('input');
      input.type = 'color';
      var colorNum = typeof value === 'string' ? parseInt(value.replace(/^0x/, ''), 16) : value;
      input.value = '#' + ('000000' + (colorNum || 0).toString(16)).slice(-6);
    } else if (field.type === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      input.value = value;
      if (field.step !== undefined) input.step = field.step;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = value;
    }
    return input;
  }

  function parseInputValue(fieldType, fieldKey, inputEl) {
    if (fieldType === 'checkbox') return inputEl.checked;
    if (fieldType === 'number') { var v = parseFloat(inputEl.value); return isNaN(v) ? 0 : v; }
    if (fieldType === 'color') return '0x' + inputEl.value.replace('#', '').toUpperCase();
    return inputEl.value;
  }

  function onChange(fn) { onChangeCallback = fn; }
  function getCurrentId() { return currentId; }

  function refresh() {
    if (currentId === '__world__') {
      showWorldSettings();
    } else if (currentId) {
      showProperties(currentId);
    }
  }

  // --- World Settings ---
  var WORLD_FIELDS = [
    { section: 'world', key: 'width',      label: 'World Width',   type: 'number', step: 10, min: 10 },
    { section: 'world', key: 'depth',      label: 'World Depth',   type: 'number', step: 10, min: 10 },
    { section: 'spawn', key: 'x',          label: 'Spawn X',       type: 'number', step: 1 },
    { section: 'spawn', key: 'z',          label: 'Spawn Z',       type: 'number', step: 1 },
    { section: 'spawn', key: 'rot',        label: 'Spawn Rotation',type: 'number', step: 0.1 },
    { section: 'player',key: 'eyeHeight',  label: 'Eye Height',    type: 'number', step: 0.1, min: 0.5 },
    { section: 'player',key: 'walkSpeed',  label: 'Walk Speed',    type: 'number', step: 0.5, min: 0.5 },
    { section: 'player',key: 'sprintSpeed',label: 'Sprint Speed',  type: 'number', step: 0.5, min: 0.5 },
    { section: 'player',key: 'radius',     label: 'Player Radius', type: 'number', step: 0.05, min: 0.1 },
    { section: 'player',key: 'gravity',    label: 'Gravity',       type: 'number', step: 1, min: 0 },
    { section: 'player',key: 'jumpSpeed',  label: 'Jump Speed',    type: 'number', step: 0.5, min: 0 },
    { section: 'colors',key: 'fog',        label: 'Fog Color',     type: 'color' }
  ];

  function showWorldSettings() {
    currentId = '__world__';
    currentType = null;
    propsBody.innerHTML = '';
    if (propsEmpty) propsEmpty.style.display = 'none';
    propsTitle.textContent = 'World Settings';

    var sd = Engine.getSceneDataRef();
    if (!sd) return;

    if (!sd.world) sd.world = { width: 100, depth: 100 };
    if (!sd.spawn) sd.spawn = { x: 50, z: 50, rot: 0 };
    if (!sd.player) sd.player = { eyeHeight: 1.6, walkSpeed: 4.0, sprintSpeed: 8.0, radius: 0.3 };
    if (!sd.colors) sd.colors = { fog: '0x9AB0C0' };

    for (var i = 0; i < WORLD_FIELDS.length; i++) {
      var wf = WORLD_FIELDS[i];
      var value = sd[wf.section] ? sd[wf.section][wf.key] : '';
      if (value === undefined) value = '';

      var field = { key: wf.key, label: wf.label, type: wf.type, step: wf.step, min: wf.min, max: wf.max };
      var row = document.createElement('div');
      row.className = 'prop-row';

      var label = document.createElement('div');
      label.className = 'prop-label';
      label.textContent = wf.label;
      row.appendChild(label);

      var inputWrap = document.createElement('div');
      inputWrap.className = 'prop-input';

      var input = createInput(field, value);
      (function(wfield, inp) {
        inp.addEventListener('change', function() {
          var newVal = parseInputValue(wfield.type, wfield.key, inp);
          if (sd[wfield.section]) sd[wfield.section][wfield.key] = newVal;
        });
      })(wf, input);

      inputWrap.appendChild(input);
      row.appendChild(inputWrap);
      propsBody.appendChild(row);
    }

    // Sky preset dropdown (if EditorSkybox available)
    if (typeof EditorSkybox !== 'undefined') {
      var skyRow = document.createElement('div');
      skyRow.className = 'prop-row';
      var skyLabel = document.createElement('div');
      skyLabel.className = 'prop-label';
      skyLabel.textContent = 'Sky';
      skyRow.appendChild(skyLabel);

      var skyWrap = document.createElement('div');
      skyWrap.className = 'prop-input';
      var skySelect = document.createElement('select');
      var presets = EditorSkybox.getPresetNames();
      var currentSky = (sd.world && sd.world.sky) || EditorSkybox.getCurrent();
      for (var si = 0; si < presets.length; si++) {
        var opt = document.createElement('option');
        opt.value = presets[si];
        opt.textContent = EditorSkybox.getPresetLabel(presets[si]);
        if (presets[si] === currentSky) opt.selected = true;
        skySelect.appendChild(opt);
      }
      skySelect.addEventListener('change', function() {
        sd.world.sky = skySelect.value;
        EditorSkybox.apply(skySelect.value);
      });
      skyWrap.appendChild(skySelect);
      skyRow.appendChild(skyWrap);
      propsBody.appendChild(skyRow);
    }
  }

  // --- Preset Picker Modal ---
  function showPresetPicker(data, faceName, callback) {
    if (typeof EditorPresets === 'undefined') return;

    var overlay = document.createElement('div');
    overlay.className = 'pm-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'pm-dialog';
    dialog.style.width = '520px';

    // Header
    var header = document.createElement('div');
    header.className = 'pm-header';
    var title = document.createElement('span');
    title.className = 'pm-title';
    title.textContent = 'Material Presets';
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'pm-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', function() { document.body.removeChild(overlay); });
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'pm-body';

    // Category filter bar
    var filterBar = document.createElement('div');
    filterBar.className = 'tex-filter-bar';
    var categories = EditorPresets.getCategories();
    var activeCategory = null;

    var allBtn = document.createElement('button');
    allBtn.className = 'face-btn active';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', function() {
      activeCategory = null;
      setActiveFilter(allBtn);
      renderPresetGrid(null);
    });
    filterBar.appendChild(allBtn);

    for (var ci = 0; ci < categories.length; ci++) {
      var catBtn = document.createElement('button');
      catBtn.className = 'face-btn';
      catBtn.textContent = categories[ci];
      (function(cat, btn) {
        btn.addEventListener('click', function() {
          activeCategory = cat;
          setActiveFilter(btn);
          renderPresetGrid(cat);
        });
      })(categories[ci], catBtn);
      filterBar.appendChild(catBtn);
    }
    body.appendChild(filterBar);

    function setActiveFilter(activeBtn) {
      var btns = filterBar.querySelectorAll('.face-btn');
      for (var b = 0; b < btns.length; b++) btns[b].classList.remove('active');
      activeBtn.classList.add('active');
    }

    // Preset grid container
    var grid = document.createElement('div');
    grid.className = 'tex-grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
    body.appendChild(grid);
    dialog.appendChild(body);
    overlay.appendChild(dialog);

    function renderPresetGrid(category) {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      var presets = EditorPresets.getByCategory(category);
      for (var pi = 0; pi < presets.length; pi++) {
        var card = document.createElement('div');
        card.className = 'tex-card';

        var swatch = document.createElement('div');
        swatch.className = 'preset-swatch';
        var cssColor = EditorPresets.colorToCSS(presets[pi].color);
        swatch.style.background = cssColor;
        if (presets[pi].metalness && presets[pi].metalness > 0.5) {
          swatch.style.background = 'linear-gradient(135deg, ' + cssColor + ' 0%, #fff 50%, ' + cssColor + ' 100%)';
        }
        if (presets[pi].opacity !== undefined && presets[pi].opacity < 1) {
          swatch.style.opacity = '0.6';
          swatch.style.background = 'repeating-conic-gradient(#888 0% 25%, ' + cssColor + ' 0% 50%) 50%/12px 12px';
        }
        if (presets[pi].emissive) {
          var emColor = EditorPresets.colorToCSS(presets[pi].emissive);
          swatch.style.boxShadow = 'inset 0 0 12px ' + emColor;
        }
        card.appendChild(swatch);

        var label = document.createElement('div');
        label.className = 'tex-label';
        label.textContent = presets[pi].name;
        card.appendChild(label);

        (function(preset) {
          card.addEventListener('click', function() {
            if (!data.faces) data.faces = {};
            if (!data.faces[faceName]) data.faces[faceName] = {};
            EditorPresets.applyPreset(preset, data.faces[faceName]);
            document.body.removeChild(overlay);
            if (callback) callback();
          });
        })(presets[pi]);

        grid.appendChild(card);
      }
    }

    renderPresetGrid(null);

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    document.body.appendChild(overlay);
  }

  return {
    init: init,
    showProperties: showProperties,
    showWorldSettings: showWorldSettings,
    onChange: onChange,
    getCurrentId: getCurrentId,
    refresh: refresh
  };
})();
