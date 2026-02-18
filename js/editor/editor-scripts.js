// ============================================================
// EDITOR-SCRIPTS — Script editing UI for the properties panel
// Supports: events, actions, action chaining, conditions, select params
// ============================================================

var EditorScripts = (function() {
  'use strict';

  var eventKeys = Object.keys(ScriptRegistry.EVENTS);
  var actionKeys = Object.keys(ScriptRegistry.ACTIONS);

  function render(container, data, onChange) {
    container.innerHTML = '';
    if (!data) return;

    var scripts = data.scripts || [];

    // Section header
    var section = document.createElement('div');
    section.className = 'sub-section';

    var header = document.createElement('div');
    header.className = 'sub-section-header';

    var toggle = document.createElement('span');
    toggle.className = 'sub-toggle open';
    toggle.textContent = '\u25B6';
    header.appendChild(toggle);

    var title = document.createElement('span');
    title.className = 'sub-section-title';
    title.textContent = 'Scripts (' + scripts.length + ')';
    header.appendChild(title);

    var addBtn = document.createElement('button');
    addBtn.className = 'sub-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add script';
    addBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!data.scripts) data.scripts = [];
      data.scripts.push({
        event: eventKeys[0],
        action: actionKeys[0],
        params: {}
      });
      render(container, data, onChange);
      if (onChange) onChange();
    });
    header.appendChild(addBtn);

    section.appendChild(header);

    var items = document.createElement('div');
    items.className = 'sub-items';

    // Toggle collapse
    var expanded = true;
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      expanded = !expanded;
      items.style.display = expanded ? 'block' : 'none';
      toggle.className = 'sub-toggle' + (expanded ? ' open' : '');
    });
    header.addEventListener('click', function() {
      expanded = !expanded;
      items.style.display = expanded ? 'block' : 'none';
      toggle.className = 'sub-toggle' + (expanded ? ' open' : '');
    });

    // Render each script
    for (var i = 0; i < scripts.length; i++) {
      renderScriptItem(items, data, i, onChange, container);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  function renderScriptItem(itemsContainer, data, index, onChange, rootContainer) {
    var script = data.scripts[index];
    var item = document.createElement('div');
    item.className = 'sub-item';

    // Item header row
    var itemHeader = document.createElement('div');
    itemHeader.className = 'sub-item-header';

    var summary = document.createElement('span');
    summary.className = 'sub-item-summary';
    summary.textContent = buildSummary(script);
    itemHeader.appendChild(summary);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'sub-remove-btn';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove script';
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      data.scripts.splice(index, 1);
      render(rootContainer, data, onChange);
      if (onChange) onChange();
    });
    itemHeader.appendChild(removeBtn);

    item.appendChild(itemHeader);

    // Expandable fields
    var fields = document.createElement('div');
    fields.className = 'sub-item-fields';

    // --- EVENT ---
    var eventRow = makeFieldRow('Event', function() {
      var sel = document.createElement('select');
      for (var ei = 0; ei < eventKeys.length; ei++) {
        var opt = document.createElement('option');
        opt.value = eventKeys[ei];
        opt.textContent = ScriptRegistry.EVENTS[eventKeys[ei]].label;
        if (eventKeys[ei] === script.event) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function() {
        script.event = this.value;
        script.params = script.params || {};
        render(rootContainer, data, onChange);
        if (onChange) onChange();
      });
      return sel;
    });
    fields.appendChild(eventRow);

    // Event params (e.g. timer interval, key)
    var evtDef = ScriptRegistry.EVENTS[script.event];
    if (evtDef && evtDef.params.length > 0) {
      for (var ep = 0; ep < evtDef.params.length; ep++) {
        fields.appendChild(makeParamRow(script, evtDef.params[ep], onChange));
      }
    }

    // --- CONDITION (optional if-variable guard) ---
    renderConditionSection(fields, script, onChange, rootContainer, data);

    // --- ACTION(S) ---
    // Support both legacy single action and chained actions array
    if (script.actions && script.actions.length > 0) {
      renderChainedActions(fields, script, onChange, rootContainer, data);
    } else {
      renderSingleAction(fields, script, onChange, rootContainer, data);
    }

    item.appendChild(fields);

    // Toggle fields on header click
    itemHeader.addEventListener('click', function() {
      fields.classList.toggle('open');
    });

    itemsContainer.appendChild(item);
  }

  // --- Summary label ---
  function buildSummary(script) {
    var evtLabel = ScriptRegistry.EVENTS[script.event]
      ? ScriptRegistry.EVENTS[script.event].label
      : script.event;

    var actLabel;
    if (script.actions && script.actions.length > 0) {
      var labels = [];
      for (var i = 0; i < script.actions.length; i++) {
        var a = script.actions[i];
        var def = ScriptRegistry.ACTIONS[a.action];
        labels.push(def ? def.label : a.action);
      }
      actLabel = labels.join(' + ');
    } else {
      var def = ScriptRegistry.ACTIONS[script.action];
      actLabel = def ? def.label : (script.action || '(none)');
    }

    var cond = '';
    if (script.condition && script.condition.type === 'if-variable' && script.condition.name) {
      cond = ' [if ' + script.condition.name + ']';
    }

    return evtLabel + ' \u2192 ' + actLabel + cond;
  }

  // --- Condition section ---
  function renderConditionSection(fields, script, onChange, rootContainer, data) {
    var condWrap = document.createElement('div');
    condWrap.className = 'script-condition-section';

    var hasCondition = !!(script.condition && script.condition.type);

    // Toggle button
    var condToggle = document.createElement('button');
    condToggle.className = 'qa-btn script-cond-toggle';
    condToggle.textContent = hasCondition ? '- Remove Condition' : '+ Add Condition';
    condToggle.style.cssText = 'font-size:11px;padding:2px 6px;margin:4px 0';
    condToggle.addEventListener('click', function() {
      if (hasCondition) {
        delete script.condition;
      } else {
        script.condition = { type: 'if-variable', name: '', value: '', op: '==' };
      }
      render(rootContainer, data, onChange);
      if (onChange) onChange();
    });
    condWrap.appendChild(condToggle);

    if (hasCondition) {
      var cond = script.condition;

      // Variable name
      condWrap.appendChild(makeFieldRow('If Variable', function() {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = cond.name || '';
        inp.placeholder = 'variable name';
        inp.addEventListener('change', function() {
          cond.name = this.value;
          if (onChange) onChange();
        });
        return inp;
      }));

      // Operator
      condWrap.appendChild(makeFieldRow('Operator', function() {
        var sel = document.createElement('select');
        var ops = ['==', '!=', '>', '<', '>=', '<='];
        for (var oi = 0; oi < ops.length; oi++) {
          var opt = document.createElement('option');
          opt.value = ops[oi];
          opt.textContent = ops[oi];
          if ((cond.op || '==') === ops[oi]) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', function() {
          cond.op = this.value;
          if (onChange) onChange();
        });
        return sel;
      }));

      // Value
      condWrap.appendChild(makeFieldRow('Value', function() {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = cond.value !== undefined ? String(cond.value) : '';
        inp.placeholder = 'expected value';
        inp.addEventListener('change', function() {
          cond.value = this.value;
          if (onChange) onChange();
        });
        return inp;
      }));
    }

    fields.appendChild(condWrap);
  }

  // --- Single action (legacy) ---
  function renderSingleAction(fields, script, onChange, rootContainer, data) {
    // Action dropdown
    var actionRow = makeFieldRow('Action', function() {
      var sel = document.createElement('select');
      for (var ai = 0; ai < actionKeys.length; ai++) {
        var opt = document.createElement('option');
        opt.value = actionKeys[ai];
        opt.textContent = ScriptRegistry.ACTIONS[actionKeys[ai]].label;
        if (actionKeys[ai] === script.action) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function() {
        script.action = this.value;
        script.params = script.params || {};
        render(rootContainer, data, onChange);
        if (onChange) onChange();
      });
      return sel;
    });
    fields.appendChild(actionRow);

    // Action params
    var actDef = ScriptRegistry.ACTIONS[script.action];
    if (actDef && actDef.params.length > 0) {
      for (var ap = 0; ap < actDef.params.length; ap++) {
        fields.appendChild(makeParamRow(script, actDef.params[ap], onChange));
      }
    }

    // "Convert to chain" button
    var chainBtn = document.createElement('button');
    chainBtn.className = 'qa-btn';
    chainBtn.textContent = '+ Chain Action';
    chainBtn.style.cssText = 'font-size:11px;padding:2px 6px;margin:4px 0';
    chainBtn.addEventListener('click', function() {
      // Convert legacy single action to chained actions array
      script.actions = [
        { action: script.action || actionKeys[0], params: JSON.parse(JSON.stringify(script.params || {})) },
        { action: actionKeys[0], params: {} }
      ];
      delete script.action;
      delete script.params;
      render(rootContainer, data, onChange);
      if (onChange) onChange();
    });
    fields.appendChild(chainBtn);
  }

  // --- Chained actions (array) ---
  function renderChainedActions(fields, script, onChange, rootContainer, data) {
    for (var ci = 0; ci < script.actions.length; ci++) {
      renderChainItem(fields, script, ci, onChange, rootContainer, data);
    }

    // "Add another action" button
    var addActBtn = document.createElement('button');
    addActBtn.className = 'qa-btn';
    addActBtn.textContent = '+ Add Action';
    addActBtn.style.cssText = 'font-size:11px;padding:2px 6px;margin:4px 0';
    addActBtn.addEventListener('click', function() {
      script.actions.push({ action: actionKeys[0], params: {} });
      render(rootContainer, data, onChange);
      if (onChange) onChange();
    });
    fields.appendChild(addActBtn);
  }

  function renderChainItem(fields, script, chainIndex, onChange, rootContainer, data) {
    var chainAct = script.actions[chainIndex];

    var chainWrap = document.createElement('div');
    chainWrap.className = 'script-chain-item';
    chainWrap.style.cssText = 'border-left:2px solid #555;padding-left:6px;margin:4px 0';

    // Chain item header with index + remove
    var chainHeader = document.createElement('div');
    chainHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:2px';

    var chainLabel = document.createElement('span');
    chainLabel.style.cssText = 'font-size:10px;color:#888;text-transform:uppercase';
    chainLabel.textContent = 'Action ' + (chainIndex + 1);
    chainHeader.appendChild(chainLabel);

    if (script.actions.length > 1) {
      var removeChainBtn = document.createElement('button');
      removeChainBtn.className = 'sub-remove-btn';
      removeChainBtn.textContent = '\u00D7';
      removeChainBtn.title = 'Remove action';
      removeChainBtn.addEventListener('click', (function(idx) {
        return function(e) {
          e.stopPropagation();
          script.actions.splice(idx, 1);
          // If only one left, convert back to single
          if (script.actions.length === 1) {
            script.action = script.actions[0].action;
            script.params = script.actions[0].params || {};
            delete script.actions;
          }
          render(rootContainer, data, onChange);
          if (onChange) onChange();
        };
      })(chainIndex));
      chainHeader.appendChild(removeChainBtn);
    }

    chainWrap.appendChild(chainHeader);

    // Action dropdown
    var actionRow = makeFieldRow('Action', function() {
      var sel = document.createElement('select');
      for (var ai = 0; ai < actionKeys.length; ai++) {
        var opt = document.createElement('option');
        opt.value = actionKeys[ai];
        opt.textContent = ScriptRegistry.ACTIONS[actionKeys[ai]].label;
        if (actionKeys[ai] === chainAct.action) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function() {
        chainAct.action = this.value;
        chainAct.params = chainAct.params || {};
        render(rootContainer, data, onChange);
        if (onChange) onChange();
      });
      return sel;
    });
    chainWrap.appendChild(actionRow);

    // Action params
    var actDef = ScriptRegistry.ACTIONS[chainAct.action];
    if (actDef && actDef.params.length > 0) {
      for (var ap = 0; ap < actDef.params.length; ap++) {
        chainWrap.appendChild(makeParamRow(chainAct, actDef.params[ap], onChange));
      }
    }

    fields.appendChild(chainWrap);
  }

  // --- Field helpers ---
  function makeFieldRow(label, createInput) {
    var row = document.createElement('div');
    row.className = 'sub-field-row';
    var lbl = document.createElement('div');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    var wrap = document.createElement('div');
    wrap.className = 'prop-input';
    wrap.appendChild(createInput());
    row.appendChild(wrap);
    return row;
  }

  function makeParamRow(script, paramDef, onChange) {
    // For chained actions, params live on the action object directly
    var paramsObj = script.params;
    if (!paramsObj) {
      script.params = {};
      paramsObj = script.params;
    }
    var currentVal = paramsObj[paramDef.key];
    if (currentVal === undefined) currentVal = paramDef.default;

    return makeFieldRow(paramDef.label, function() {
      var input;
      if (paramDef.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = currentVal !== false && currentVal !== 'false';
        input.addEventListener('change', function() {
          paramsObj[paramDef.key] = this.checked;
          if (onChange) onChange();
        });
      } else if (paramDef.type === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = currentVal;
        input.step = 'any';
        input.addEventListener('change', function() {
          paramsObj[paramDef.key] = parseFloat(this.value) || 0;
          if (onChange) onChange();
        });
      } else if (paramDef.type === 'select' && paramDef.options) {
        input = document.createElement('select');
        for (var si = 0; si < paramDef.options.length; si++) {
          var opt = document.createElement('option');
          opt.value = paramDef.options[si];
          opt.textContent = paramDef.options[si];
          if (paramDef.options[si] === currentVal) opt.selected = true;
          input.appendChild(opt);
        }
        input.addEventListener('change', function() {
          paramsObj[paramDef.key] = this.value;
          if (onChange) onChange();
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = currentVal || '';
        input.addEventListener('change', function() {
          paramsObj[paramDef.key] = this.value;
          if (onChange) onChange();
        });
      }
      return input;
    });
  }

  return {
    render: render
  };
})();
