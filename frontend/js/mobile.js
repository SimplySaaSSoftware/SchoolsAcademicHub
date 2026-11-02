/* mobile.js — on phones every data table becomes a stack of cards (CSS in main.css, max-width 600px).
   Labels each cell from its column header so no table ever scrolls sideways or hides its action buttons. */
(() => {
  function stack(table) {
    if (table.dataset.stacked) return;
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.tagName === 'TD' && !td.hasAttribute('colspan')) td.dataset.label = heads[i] ?? '';
      });
    });
    table.classList.add('table--stack');
    table.dataset.stacked = '1';
  }
  const run = () => document.querySelectorAll('table.table:not([data-stacked])').forEach(stack);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  run();
})();
