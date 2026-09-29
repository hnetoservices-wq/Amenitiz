(() => {
  'use strict';
  const key = `rate-order:v1:${location.hostname}`;
  const rowSelector = 'tr[data-testid^="rate-plan-row-"]';
  const pt = document.documentElement.lang.startsWith('pt') || location.pathname.startsWith('/pt/');
  const words = pt ? {
    title: 'Organizar tarifas', help: 'Arraste ⋮⋮ ou use Alt + ↑ / ↓. Ordem guardada neste navegador.',
    reset: 'Ordem original', saved: 'Ordem guardada', error: 'Não foi possível guardar. Tente novamente.',
    move: 'Mover', cancel: 'Movimento cancelado'
  } : {
    title: 'Organize rates', help: 'Drag ⋮⋮ or use Alt + ↑ / ↓. Order saved in this browser.',
    reset: 'Original order', saved: 'Order saved', error: 'Could not save. Please try again.',
    move: 'Move', cancel: 'Move cancelled'
  };
  let order = [], table, rows = [], bar, status, drag, scheduled = false;
  let writes = Promise.resolve();
  const id = row => row.dataset.testid.slice('rate-plan-row-'.length);
  const name = row => row.querySelector('[data-testid^="rate-plan-link-"]')?.textContent.trim() || id(row);
  const visibleOrder = () => [...rows].sort((a, b) => Number(a.style.order) - Number(b.style.order)).map(id);
  function announce(message) { if (status) status.textContent = message; }
  function apply() {
    const known = new Map(order.map((value, index) => [value, index]));
    rows.forEach((row, index) => {
      row.style.order = String(known.has(id(row)) ? known.get(id(row)) : order.length + index);
    });
  }
  function save() {
    const snapshot = [...order];
    announce('…');
    writes = writes.catch(() => {}).then(() => chrome.storage.local.set({ [key]: snapshot }))
      .then(() => announce(words.saved), () => announce(words.error));
  }
  function choose(next) { order = next; apply(); save(); }
  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }
  function stopDrag(cancel = false) {
    if (!drag) return;
    const previous = drag.previous;
    drag = null;
    document.querySelectorAll('.amr-dragging,.amr-target').forEach(el => el.classList.remove('amr-dragging', 'amr-target'));
    if (cancel) { order = previous; apply(); announce(words.cancel); }
  }
  // Inventory's custom dropdown wraps each option in its own React-owned div.
  const rateSelector = '[class*="inventory-controls__rate-plan-selector___"], [data-testid="room-rate-selector"] [data-testid="rate-selector"]';
  const optionSelector = '[data-testid="dropdown-item"][data-option], [data-testid="dropdown-checkbox-item"][data-option]';
  function dropdownEntries(selector) {
    return [...selector.querySelectorAll(optionSelector)].map(option => ({
      option, wrapper: option.parentElement, id: option.dataset.option
    }));
  }
  function sortDropdowns() {
    const positions = new Map(order.map((value, index) => [value, index]));
    document.querySelectorAll(rateSelector).forEach(selector => {
      const entries = dropdownEntries(selector).filter(entry => entry.id !== 'all');
      if (!entries.length) return;
      const list = entries[0].wrapper.parentElement;
      // Fail closed if Amenitiz changes the wrapper structure.
      if (entries.some(entry => entry.wrapper.parentElement !== list) ||
          list.children.length !== entries.length) return;
      list.classList.toggle('amr-rate-options', order.length > 0);
      entries.forEach((entry, index) => {
        entry.wrapper.style.order = order.length
          ? String(positions.has(entry.id) ? positions.get(entry.id) : order.length + index)
          : '';
      });
    });
  }
  // Follow the visual order when navigating options with the keyboard.
  document.addEventListener('keydown', event => {
    const option = event.target.closest?.(optionSelector);
    const selector = option?.closest(rateSelector);
    if (!selector || !order.length || !selector.querySelector('.amr-rate-options') ||
        event.altKey || event.ctrlKey || event.metaKey) return;
    const entries = dropdownEntries(selector).sort((a, b) => (a.id === 'all' ? -1 : Number(a.wrapper.style.order)) - (b.id === 'all' ? -1 : Number(b.wrapper.style.order)));
    const index = entries.findIndex(entry => entry.option === option);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + entries.length) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else if (event.key === 'Tab') {
      next = index + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= entries.length) {
        // Exit the menu rather than following the original DOM order back into it.
        const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
          .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length);
        const optionIndices = entries.map(entry => focusables.indexOf(entry.option)).filter(i => i >= 0);
        if (!optionIndices.length) return;
        const outside = focusables[event.shiftKey ? Math.min(...optionIndices) - 1 : Math.max(...optionIndices) + 1];
        if (!outside) return;
        event.preventDefault(); event.stopImmediatePropagation(); outside.focus(); return;
      }
    } else return;
    event.preventDefault(); event.stopImmediatePropagation();
    entries[next].option.focus();
    entries[next].option.scrollIntoView?.({ block: 'nearest' });
  }, true);
  function setup() {
    sortDropdowns();
    const nextTable = document.querySelector('[data-testid="rate-plans-table"] table');
    if (!nextTable) {
      bar?.remove(); bar = null; table = null; rows = []; stopDrag(); return;
    }
    table = nextTable;
    rows = [...table.querySelectorAll(`tbody > ${rowSelector}`)];
    if (!rows.length) { bar?.remove(); bar = null; return; }
    table.classList.add('amr-table');
    const root = table.closest('[data-react-class="RatePlans/index"]') || table.closest('[data-testid="rate-plans-table"]');
    if (!bar?.isConnected) {
      bar = document.createElement('section'); bar.className = 'amr-toolbar'; bar.setAttribute('aria-label', words.title);
      const title = document.createElement('strong'); title.textContent = words.title;
      const help = document.createElement('span'); help.textContent = words.help;
      status = document.createElement('span'); status.className = 'amr-status'; status.setAttribute('role', 'status');
      bar.append(title, help,
        button('A → Z', () => choose([...rows].sort((a, b) => name(a).localeCompare(name(b), pt ? 'pt' : 'en', { numeric: true })).map(id))),
        button('Z → A', () => choose([...rows].sort((a, b) => name(b).localeCompare(name(a), pt ? 'pt' : 'en', { numeric: true })).map(id))),
        button(words.reset, () => choose([])), status);
      root.before(bar);
    }
    rows.forEach(row => {
      if (row.querySelector('.amr-handle')) return;
      const handle = button('⋮⋮', () => {});
      handle.className = 'amr-handle'; handle.draggable = true;
      handle.setAttribute('aria-label', `${words.move}: ${name(row)}`);
      handle.title = `${words.move}: ${name(row)} — Alt + ↑ / ↓`;
      handle.addEventListener('click', event => event.stopPropagation());
      handle.addEventListener('keydown', event => {
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = visibleOrder(), from = next.indexOf(id(row));
        const to = from + (event.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= next.length) return;
        [next[from], next[to]] = [next[to], next[from]];
        choose(next);
      });
      handle.addEventListener('dragstart', event => {
        drag = { id: id(row), previous: [...order] };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id(row));
        event.dataTransfer.setDragImage(row, 24, 20);
        row.classList.add('amr-dragging');
      });
      handle.addEventListener('dragend', () => stopDrag());
      row.addEventListener('dragover', event => {
        if (!drag || drag.id === id(row)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.amr-target').forEach(el => el.classList.remove('amr-target'));
        row.classList.add('amr-target');
        if (event.clientY < 80) window.scrollBy(0, -20);
        else if (event.clientY > innerHeight - 80) window.scrollBy(0, 20);
      });
      row.addEventListener('drop', event => {
        if (!drag) return;
        event.preventDefault(); event.stopPropagation();
        const source = drag.id, target = id(row);
        if (source === target) { stopDrag(); return; }
        const next = visibleOrder().filter(value => value !== source);
        const rect = row.getBoundingClientRect();
        next.splice(next.indexOf(target) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0), 0, source);
        stopDrag(); choose(next);
        rows.find(item => id(item) === source)?.querySelector('.amr-handle')?.focus();
      });
      row.cells[0].prepend(handle);
    });
    apply();
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') stopDrag(true); });
  chrome.storage.local.get(key).then(result => {
    order = Array.isArray(result[key]) ? [...new Set(result[key].filter(value => typeof value === 'string'))] : [];
  }).catch(() => {}).finally(() => {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, key)) return;
      const value = changes[key].newValue;
      order = Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];
      setup();
    });
    setup();
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; setup(); });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-option'] });
  });
})();
