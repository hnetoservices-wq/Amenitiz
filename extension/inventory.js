(() => {
  'use strict';
  const initialized = new WeakSet();
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
      const detail = row(grid, 'min-stay-row');
      // Hidden/lazy rooms are handled once laid out; never toggle an already expanded section.
      if (!header || !room.getClientRects().length) return;
      const expanded = detail && detail.getBoundingClientRect().height > 0 &&
        getComputedStyle(detail).display !== 'none' && getComputedStyle(detail).visibility !== 'hidden';
      initialized.add(heading);
      if (!expanded) header.click();
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
