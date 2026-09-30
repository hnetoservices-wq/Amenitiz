(() => {
  'use strict';
  const initialized = new WeakSet();
  const attempts = new WeakMap();
  const roomSelector = '[data-testid="inventory-room-calendar"]';
  const row = (grid, testId) => [...grid.children].find(el => el.dataset.testid === testId);
  const stayIds = ['min-max-stay-row', 'min-stay-row', 'max-stay-row'];
  const restrictionIds = ['rate-restrictions-row', 'closed-to-arrival-row', 'closed-to-departure-row', 'closed-rate-row'];
  function update() {
    document.querySelectorAll(roomSelector).forEach(room => {
      const heading = room.querySelector('[data-testid="min-max-stay-row"]');
      const grid = heading?.parentElement;
      if (!grid || !row(grid, 'rate-restrictions-row')) return;
      if (!grid.classList.contains('amr-inventory-grid')) grid.classList.add('amr-inventory-grid');
      // Reorder both groups, including their expanded detail rows, without moving React nodes.
      const children = [...grid.children];
      const stays = children.filter(el => stayIds.includes(el.dataset.testid));
      const restrictions = children.filter(el => restrictionIds.includes(el.dataset.testid));
      const first = children.findIndex(el => stays.includes(el) || restrictions.includes(el));
      const desired = children.filter(el => !stays.includes(el) && !restrictions.includes(el));
      desired.splice(first, 0, ...stays, ...restrictions);
      desired.forEach((el, index) => {
        if (el.style.order !== String(index)) el.style.order = String(index);
      });
      if (initialized.has(heading)) return;
      const header = heading.querySelector('[data-testid="expandable-header"] [data-testid="header"]');
      const icon = heading.querySelector('[data-testid="expand-icon"]');
      // Use Amenitiz's actual open-state markers, not row geometry: collapsed
      // detail rows remain mounted and may still have a measurable height.
      const expanded = [...heading.classList].some(value => value.includes('__row--open___')) ||
        !!icon?.querySelector('[title="arrows/chevron-up"]');
      if (expanded) { initialized.add(heading); return; }
      if (!header || !icon || !room.getClientRects().length) return;
      const attempt = attempts.get(heading) || { count: 0, pending: false };
      if (attempt.pending || attempt.count >= 4) return;
      attempt.count += 1; attempt.pending = true; attempts.set(heading, attempt);
      // Clicking the icon also reaches any handlers on its ancestors.
      icon.click();
      setTimeout(() => {
        attempt.pending = false;
        if (heading.isConnected) schedule();
      }, 250);

    });
  }
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; update(); });
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('load', schedule, { once: true });
  schedule();
})();
