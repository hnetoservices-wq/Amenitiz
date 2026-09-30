(() => {
  'use strict';

  const STORAGE_KEY = 'amenitiz-theme:v1';
  const DEFAULT_THEME = 'amenitiz';
  const THEMES = [
    { id: 'amenitiz', label: 'Amenitiz', swatch: 'linear-gradient(135deg,#ffffff 0 50%,#6d5dfc 50% 100%)' },
    { id: 'dark', label: 'Dark', swatch: '#17191f' },
    { id: 'midnight', label: 'Midnight', swatch: '#111827' },
    { id: 'slate', label: 'Slate', swatch: '#334155' }
  ];

  const root = document.documentElement;
  let currentTheme = DEFAULT_THEME;
  let picker;
  let panel;
  let paintFrame = 0;
  let fullPaintRequested = false;
  const pendingPaintRoots = new Set();

  function normalizeTheme(value) {
    return THEMES.some(theme => theme.id === value) ? value : DEFAULT_THEME;
  }

  function parseRgb(value) {
    const match = value?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] == null ? 1 : Number(match[4])
    };
  }

  function brightness(c) {
    return (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
  }

  function spread(c) {
    return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  }

  function isExtensionUi(el) {
    return el.id === 'amx-theme-shell' || !!el.closest?.('#amx-theme-shell');
  }

  function classifyElement(el) {
    if (!(el instanceof HTMLElement) || isExtensionUi(el)) return;

    const style = getComputedStyle(el);
    const bg = parseRgb(style.backgroundColor);
    const fg = parseRgb(style.color);

    // Neutral/light backgrounds are the main source of white islands in
    // Amenitiz screens that use generated CSS class names.
    if (bg && bg.a > 0.05 && brightness(bg) > 205 && spread(bg) < 42) {
      el.dataset.amxPaintSurface = brightness(bg) > 242 ? '1' : '2';
    } else {
      delete el.dataset.amxPaintSurface;
    }

    // Recolour only neutral dark text. Saturated brand/status colours stay native.
    if (fg && fg.a > 0.15 && brightness(fg) < 135 && spread(fg) < 58) {
      el.dataset.amxPaintText = brightness(fg) < 75 ? 'strong' : 'soft';
    } else {
      delete el.dataset.amxPaintText;
    }

    // Neutral pale borders are common in inventory/calendar grids.
    const border = parseRgb(style.borderTopColor);
    if (border && border.a > 0.05 && brightness(border) > 155 && spread(border) < 45 && style.borderTopStyle !== 'none') {
      el.dataset.amxPaintBorder = 'true';
    } else {
      delete el.dataset.amxPaintBorder;
    }
  }

  function classifySubtree(start) {
    if (!start || !(start instanceof HTMLElement)) return;
    classifyElement(start);
    start.querySelectorAll('*').forEach(classifyElement);
  }

  function clearPaint() {
    document.querySelectorAll('[data-amx-paint-surface],[data-amx-paint-text],[data-amx-paint-border]').forEach(el => {
      delete el.dataset.amxPaintSurface;
      delete el.dataset.amxPaintText;
      delete el.dataset.amxPaintBorder;
    });
  }

  // Classification must always read Amenitiz's native colours, not colours already
  // changed by one of our themes. Temporarily removing the theme attribute lets
  // getComputedStyle() see the original page without producing a visible frame.
  function classifyNative(roots) {
    if (currentTheme === DEFAULT_THEME || !document.body) return;
    const activeTheme = root.getAttribute('data-amx-theme');
    root.removeAttribute('data-amx-theme');
    try {
      roots.forEach(classifySubtree);
    } finally {
      if (activeTheme) root.setAttribute('data-amx-theme', activeTheme);
    }
  }

  function cancelPaintQueue() {
    if (paintFrame) cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    fullPaintRequested = false;
    pendingPaintRoots.clear();
  }

  function flushPaintQueue() {
    paintFrame = 0;
    if (currentTheme === DEFAULT_THEME || !document.body) {
      fullPaintRequested = false;
      pendingPaintRoots.clear();
      return;
    }

    const roots = fullPaintRequested
      ? [document.body]
      : [...pendingPaintRoots].filter(node => node?.isConnected && node instanceof HTMLElement);

    fullPaintRequested = false;
    pendingPaintRoots.clear();
    if (roots.length) classifyNative(roots);
  }

  function schedulePaint(start = document.body, full = false) {
    if (currentTheme === DEFAULT_THEME || !document.body) return;

    if (full) {
      // A full-page request always wins over any smaller pending React mutation.
      fullPaintRequested = true;
      pendingPaintRoots.clear();
    } else if (!fullPaintRequested && start instanceof HTMLElement && !isExtensionUi(start)) {
      pendingPaintRoots.add(start);
    }

    if (!paintFrame) paintFrame = requestAnimationFrame(flushPaintQueue);
  }

  function updatePickerState() {
    if (picker) {
      picker.dataset.theme = currentTheme;
      picker.setAttribute('aria-label', `Theme: ${THEMES.find(item => item.id === currentTheme)?.label || 'Amenitiz'}`);
      picker.title = picker.getAttribute('aria-label');
    }

    if (panel) {
      panel.querySelectorAll('[data-amx-theme-option]').forEach(button => {
        const active = button.dataset.amxThemeOption === currentTheme;
        button.setAttribute('aria-checked', String(active));
        button.dataset.active = String(active);
      });
    }
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    const previousTheme = currentTheme;

    if (nextTheme === DEFAULT_THEME) {
      currentTheme = DEFAULT_THEME;
      cancelPaintQueue();
      root.removeAttribute('data-amx-theme');
      clearPaint();
      updatePickerState();
      return;
    }

    // Entering a custom theme: classify the entire page while it is still native.
    // This prevents the first pending React mutation from stealing the full scan.
    if (previousTheme === DEFAULT_THEME) {
      currentTheme = nextTheme;
      root.removeAttribute('data-amx-theme');
      if (document.body) classifySubtree(document.body);
      root.setAttribute('data-amx-theme', nextTheme);
      cancelPaintQueue();
    } else {
      // Custom -> custom only changes palette variables. Reclassification here would
      // inspect colours produced by the previous theme and cause white islands.
      currentTheme = nextTheme;
      root.setAttribute('data-amx-theme', nextTheme);
    }

    updatePickerState();
  }

  async function saveTheme(theme) {
    const next = normalizeTheme(theme);
    applyTheme(next);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
    } catch (_) {}
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    picker?.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    if (!panel || !picker) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    picker.setAttribute('aria-expanded', String(opening));
    if (opening) panel.querySelector('[data-active="true"]')?.focus();
  }

  function createPicker() {
    if (!document.body || document.getElementById('amx-theme-picker')) return;

    picker = document.createElement('button');
    picker.id = 'amx-theme-picker';
    picker.type = 'button';
    picker.className = 'amx-theme-picker';
    picker.setAttribute('aria-haspopup', 'true');
    picker.setAttribute('aria-expanded', 'false');
    picker.innerHTML = '<span class="amx-theme-picker__icon" aria-hidden="true">◐</span><span class="amx-theme-picker__label">Theme</span>';
    picker.addEventListener('click', event => {
      event.stopPropagation();
      togglePanel();
    });

    panel = document.createElement('div');
    panel.id = 'amx-theme-panel';
    panel.className = 'amx-theme-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'radiogroup');
    panel.setAttribute('aria-label', 'Amenitiz theme');

    const heading = document.createElement('div');
    heading.className = 'amx-theme-panel__heading';
    heading.textContent = 'Appearance';
    panel.appendChild(heading);

    THEMES.forEach(theme => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'amx-theme-option';
      option.dataset.amxThemeOption = theme.id;
      option.setAttribute('role', 'radio');
      option.innerHTML = `<span class="amx-theme-option__swatch" style="background:${theme.swatch}"></span><span class="amx-theme-option__label">${theme.label}</span><span class="amx-theme-option__check" aria-hidden="true">✓</span>`;
      option.addEventListener('click', async () => {
        await saveTheme(theme.id);
        closePanel();
        picker?.focus();
      });
      panel.appendChild(option);
    });

    const shell = document.createElement('div');
    shell.id = 'amx-theme-shell';
    shell.className = 'amx-theme-shell';
    shell.append(panel, picker);
    document.body.appendChild(shell);
    updatePickerState();

    new MutationObserver(mutations => {
      if (currentTheme === DEFAULT_THEME) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && !isExtensionUi(node)) schedulePaint(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#amx-theme-shell')) closePanel();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      closePanel();
      picker?.focus();
    }
  });

  chrome.storage.local.get(STORAGE_KEY).then(result => {
    applyTheme(result[STORAGE_KEY]);
  }).catch(() => {
    applyTheme(DEFAULT_THEME);
  }).finally(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createPicker, { once: true });
    } else {
      createPicker();
    }
  });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    applyTheme(changes[STORAGE_KEY].newValue);
  });
})();
