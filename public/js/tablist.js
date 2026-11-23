// Every [role="tablist"] on the site: click or arrow keys switch panels (WAI-ARIA tabs pattern).
// Markup ships with the first panel visible and the rest hidden, so pages work without JS.
// A tablist with data-typewriter types the newly selected panel's code out instead of showing it at once.
(function initTablists() {
  const tablists = document.querySelectorAll('[role="tablist"]');
  if (!tablists.length) return;

  const KEY_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const TYPING_CHARS_PER_MS = 0.0875; // about 90 characters a second
  const MAX_TYPING_MS = 4800; // long queries type faster so no panel takes longer than this
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function panelFor(tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  }

  // Types the code in a panel character by character. The not-yet-typed rest stays in the layout
  // (hidden by CSS) so the panel keeps its final height and the page does not jump.
  // Returns a function that stops the animation and puts the full text back.
  function typeCode(code) {
    const fullText = code.textContent;
    const typed = document.createElement("span");
    const rest = document.createElement("span");
    rest.className = "typewriter__rest";
    code.replaceChildren(typed, rest);

    let frame = 0;
    const start = performance.now();
    const charsPerMs = Math.max(TYPING_CHARS_PER_MS, fullText.length / MAX_TYPING_MS);

    function finish() {
      cancelAnimationFrame(frame);
      code.textContent = fullText;
    }

    function step(now) {
      const count = Math.min(fullText.length, Math.floor((now - start) * charsPerMs));
      typed.textContent = fullText.slice(0, count);
      rest.textContent = fullText.slice(count);
      if (count < fullText.length) frame = requestAnimationFrame(step);
      else finish();
    }

    step(start);
    return finish;
  }

  function selectTab(tabs, selected, { moveFocus, animate, state }) {
    const alreadySelected = selected.getAttribute("aria-selected") === "true";
    for (const tab of tabs) {
      const isSelected = tab === selected;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      panelFor(tab).hidden = !isSelected;
    }
    if (moveFocus) selected.focus();

    if (!state.typewriter) return;
    if (state.stopTyping) {
      state.stopTyping();
      state.stopTyping = null;
    }
    const code = panelFor(selected).querySelector("code");
    if (animate && !alreadySelected && code && !reducedMotion.matches) state.stopTyping = typeCode(code);
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
    const state = { typewriter: tablist.hasAttribute("data-typewriter"), stopTyping: null };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(tabs, tab, { moveFocus: false, animate: true, state }));
      tab.addEventListener("keydown", (event) => {
        const target = targetForKey(tabs, index, event.key);
        if (!target) return;
        event.preventDefault();
        selectTab(tabs, target, { moveFocus: true, animate: true, state });
      });
    });

    const initiallySelected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    selectTab(tabs, initiallySelected, { moveFocus: false, animate: false, state });
  }
})();
