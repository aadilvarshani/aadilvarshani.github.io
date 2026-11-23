// Plan blueprint: a drawing of the finished system, one box per area.
// Choosing a phase restyles the boxes: built by then (solid), added in that phase (accent),
// still to come (dashed). Choosing a box shows its lines beside the drawing, each line marked
// done, new or future for the chosen phase. The page carries a wide and a portrait drawing;
// CSS shows one and both share the selection.
// Without JS every box and caption stays visible as a plain list under the drawing.
(function initPlans() {
  const ORDER = ["1", "1.5", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
  const DEFAULT_STEP = "1.5";
  const NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  const stateAt = (phase, at) => {
    const index = ORDER.indexOf(phase);
    return index < at ? "done" : index === at ? "new" : "future";
  };

  for (const plan of document.querySelectorAll("[data-plan]")) {
    const steps = Array.from(plan.querySelectorAll("[data-step]"));
    const captions = Array.from(plan.querySelectorAll("[data-caption]"));
    const items = Array.from(plan.querySelectorAll("[data-phase]"));
    const blocks = Array.from(plan.querySelectorAll(".plan__block[data-area]"));
    const parts = Array.from(plan.querySelectorAll(".plan-part[data-area]"));
    if (!steps.length || !items.length) continue;

    plan.classList.add("plan--live");
    let area = null;

    function showArea(key) {
      area = key;
      for (const part of parts) part.setAttribute("aria-pressed", String(part.dataset.area === key));
      for (const block of blocks) block.hidden = block.dataset.area !== key;
    }

    function select(key) {
      const at = ORDER.indexOf(key);
      for (const step of steps) {
        const index = ORDER.indexOf(step.dataset.step);
        step.setAttribute("aria-pressed", String(index === at));
        step.dataset.state = index < at ? "past" : index === at ? "current" : "future";
      }
      for (const caption of captions) caption.hidden = caption.dataset.caption !== key;
      for (const item of items) item.dataset.state = stateAt(item.dataset.phase, at);
      const areaState = {};
      for (const block of blocks) {
        const states = Array.from(block.querySelectorAll("[data-phase]"), (item) => item.dataset.state);
        block.dataset.state = states.includes("new") ? "new" : states.includes("done") ? "done" : "future";
        areaState[block.dataset.area] = block.dataset.state;
      }
      for (const part of parts) part.dataset.state = areaState[part.dataset.area];
      // Follow the phase: if the open box has nothing new in it, open the first box that does.
      if (!area || areaState[area] !== "new") {
        const first = blocks.find((block) => block.dataset.state === "new");
        showArea(first ? first.dataset.area : area ?? blocks[0].dataset.area);
      }
    }

    for (const part of parts) {
      part.addEventListener("click", () => showArea(part.dataset.area));
      part.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showArea(part.dataset.area);
          return;
        }
        const step = NEXT_KEYS[event.key];
        if (!step) return;
        event.preventDefault();
        const siblings = Array.from(part.ownerSVGElement.querySelectorAll(".plan-part[data-area]"));
        const next = siblings[(siblings.indexOf(part) + step + siblings.length) % siblings.length];
        showArea(next.dataset.area);
        next.focus();
      });
    }
    for (const step of steps) step.addEventListener("click", () => select(step.dataset.step));
    select(DEFAULT_STEP);
  }
})();
