// Every [role="tablist"] on the site: click or arrow keys switch panels (WAI-ARIA tabs pattern).
// Markup ships with the first panel visible and the rest hidden, so pages work without JS.
(function initTablists() {
  const tablists = document.querySelectorAll('[role="tablist"]');
  if (!tablists.length) return;

  const KEY_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  function panelFor(tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  }

  function selectTab(tabs, selected, { moveFocus }) {
    for (const tab of tabs) {
      const isSelected = tab === selected;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      panelFor(tab).hidden = !isSelected;
    }
    if (moveFocus) selected.focus();
  }

  function targetForKey(tabs, index, key) {
    if (key === "Home") return tabs[0];
    if (key === "End") return tabs[tabs.length - 1];
    const step = KEY_STEPS[key];
    return step ? tabs[(index + step + tabs.length) % tabs.length] : null;
  }

  for (const tablist of tablists) {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    if (!tabs.length) continue;

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(tabs, tab, { moveFocus: false }));
      tab.addEventListener("keydown", (event) => {
        const target = targetForKey(tabs, index, event.key);
        if (!target) return;
        event.preventDefault();
        selectTab(tabs, target, { moveFocus: true });
      });
    });

    const initiallySelected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    selectTab(tabs, initiallySelected, { moveFocus: false });
  }
})();
