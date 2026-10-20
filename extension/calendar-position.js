(() => {
  'use strict';

  // The extension only adjusts which month a native Amenitiz date picker
  // displays. React keeps ownership of date values and selection handlers.
  const inputSelector =
    'input[data-testid="start-date-input"],input[data-testid="end-date-input"],' +
    'input[data-testid="date-input"],input[placeholder="dd/MM/yyyy"]';
  const triggerSelector =
    '[data-testid="from-to-selector-input"],[class*="datepicker__input___"]';
  const calendarSelector = '[data-testid="calendar"]';
  const maxSteps = 72;

  let pending = null;
  let observer = null;
  let scanQueued = false;
  const monthNames = new Map();

  function normalize(value) {
    return String(value || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // Amenitiz localizes its month labels. Build a lookup for the page language
  // and common Amenitiz languages instead of assuming "out." or "Oct".
  for (const locale of [
    document.documentElement.lang || 'pt', 'pt-PT', 'en-US', 'es-ES',
    'fr-FR', 'it-IT', 'de-DE'
  ]) {
    for (let month = 0; month < 12; month += 1) {
      for (const width of ['short', 'long']) {
        try {
          const label = new Intl.DateTimeFormat(locale, { month: width })
            .format(new Date(2020, month, 1));
          monthNames.set(normalize(label), month);
        } catch (_) { /* Unsupported locale: other fallbacks remain. */ }
      }
    }
  }

  function selectedMonth(input) {
    const value = input && input.value && input.value.trim();
    if (!value) return null;
    let y, m, d;
    let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
    } else {
      match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (!match) return null;
      const first = Number(match[1]);
      const second = Number(match[2]);
      y = Number(match[3]);
      const monthFirst = /^en-us$/i.test(document.documentElement.lang);
      d = monthFirst ? second : first;
      m = monthFirst ? first : second;
    }
    if (y < 1900 || y > 2100 || m < 1 || m > 12 ||
        new Date(y, m - 1, d).getFullYear() !== y ||
        new Date(y, m - 1, d).getMonth() !== m - 1 ||
        new Date(y, m - 1, d).getDate() !== d) return null;
    return y * 12 + (m - 1);
  }

  function contextFor(target) {
    if (!(target instanceof Element)) return null;
    const direct = target.closest(inputSelector);
    const trigger = direct || target.closest(triggerSelector);
    if (!trigger) return null;
    const range = trigger.closest('[data-testid^="multiple-date-range_"]');
    const owner = range || trigger.closest('[data-testid="inventory-controls"]') ||
      trigger.parentElement;
    const inputs = owner ? [...owner.querySelectorAll(inputSelector)] : [];
    if (direct && !inputs.includes(direct)) inputs.unshift(direct);
    let targetMonth = selectedMonth(direct);
    if (targetMonth === null) {
      // Start may be empty while End holds the selected date (and vice versa).
      const preferred = [
        ...inputs.filter(el => el.dataset.testid === 'start-date-input'),
        ...inputs.filter(el => el.dataset.testid === 'end-date-input'),
        ...inputs
      ];
      for (const input of preferred) {
        targetMonth = selectedMonth(input);
        if (targetMonth !== null) break;
      }
    }
    if (targetMonth === null && range) {
      // A newly added interval has empty fields: carry on from the preceding
      // interval rather than jumping back to today.
      const ranges = [...document.querySelectorAll('[data-testid^="multiple-date-range_"]')];
      const before = ranges.slice(0, ranges.indexOf(range)).reverse();
      for (const previous of before) {
        for (const input of previous.querySelectorAll(
          'input[data-testid="end-date-input"],input[data-testid="start-date-input"]'
        )) {
          targetMonth = selectedMonth(input);
          if (targetMonth !== null) break;
        }
        if (targetMonth !== null) break;
      }
    }
    return { anchor: trigger, owner, targetMonth };
  }

  function isVisible(element) {
    return element.isConnected && !!element.getClientRects().length &&
      getComputedStyle(element).visibility !== 'hidden';
  }

  function findCalendar(session) {
    const owned = session.owner && [...session.owner.querySelectorAll(calendarSelector)]
      .filter(isVisible);
    if (owned && owned.length) return owned[0];
    // Some date pickers put their popup in a React portal, outside the input.
    const candidates = [...document.querySelectorAll(calendarSelector)].filter(isVisible);
    if (!candidates.length) return null;
    const rect = session.anchor.getBoundingClientRect();
    candidates.sort((a, b) => {
      const distance = el => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.left - rect.left) + Math.abs(r.top - rect.bottom);
      };
      return distance(a) - distance(b);
    });
    return candidates[0];
  }

  function shownMonth(calendar) {
    const month = normalize(calendar.querySelector('[data-testid="month-selector"]')?.textContent);
    const yearText = calendar.querySelector('[data-testid="year-selector"]')?.textContent || '';
    const year = Number(yearText.match(/\d{4}/)?.[0]);
    return monthNames.has(month) && year >= 1900 && year <= 2100
      ? year * 12 + monthNames.get(month) : null;
  }

  function stop() {
    if (!pending) return;
    clearTimeout(pending.poll);
    clearTimeout(pending.expire);
    observer?.disconnect();
    observer = null;
    pending = null;
  }

  function queueScan() {
    if (!pending || scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan();
    });
  }

  function scan() {
    const session = pending;
    if (!session || !session.anchor.isConnected) { stop(); return; }
    const calendar = findCalendar(session);
    if (!calendar) return; // Wait for the popup to mount/open.
    const shown = shownMonth(calendar);
    if (shown === null) return; // Unknown widget: fail without changing it.

    if (session.waitingForChange !== null) {
      if (shown === session.waitingForChange) {
        if (Date.now() - session.lastClick > 850) stop();
        return;
      }
      session.waitingForChange = null;
    }
    if (shown === session.targetMonth) { stop(); return; }
    if (session.steps >= maxSteps) { stop(); return; }

    const direction = shown < session.targetMonth ? 'next-month' : 'prev-month';
    const button = calendar.querySelector('[data-testid="' + direction + '"]');
    if (!button || button.disabled || !isVisible(button)) { stop(); return; }

    session.steps += 1;
    session.waitingForChange = shown;
    session.lastClick = Date.now();
    button.click(); // Use Amenitiz's own React navigation handler.
    clearTimeout(session.poll);
    session.poll = setTimeout(function poll() {
      if (pending !== session) return;
      queueScan();
      session.poll = setTimeout(poll, 75);
    }, 75);
  }

  function begin(target) {
    const context = contextFor(target);
    if (!context) return;
    stop();
    if (context.targetMonth === null) return; // No selected date: native today.
    pending = {
      ...context,
      steps: 0,
      waitingForChange: null,
      lastClick: 0,
      poll: null,
      expire: setTimeout(stop, 8000)
    };
    observer = new MutationObserver(queueScan);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
    queueScan();
  }

  document.addEventListener('click', event => {
    // A human selecting a day or navigating manually takes priority.
    if (event.isTrusted && event.target instanceof Element &&
        event.target.closest(calendarSelector)) {
      stop();
      return;
    }
    if (contextFor(event.target)) begin(event.target);
  }, true);

  // Supports opening the picker with the keyboard, where focus may be enough.
  document.addEventListener('focusin', event => {
    if (event.target instanceof Element && event.target.matches(inputSelector)) {
      begin(event.target);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') stop();
  }, true);
})();
