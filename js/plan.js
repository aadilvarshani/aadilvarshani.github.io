// Phase blueprint: choosing a phase shows which parts of the plan exist once that phase ships.
// Without JS every item and caption stays visible as a plain list.
(function initPlans() {
  const ORDER = ["1", "1.5", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
  const DEFAULT_STEP = "1.5";

  for (const plan of document.querySelectorAll("[data-plan]")) {
    const steps = Array.from(plan.querySelectorAll("[data-step]"));
    const captions = Array.from(plan.querySelectorAll("[data-caption]"));
    const items = Array.from(plan.querySelectorAll("[data-phase]"));
    const blocks = Array.from(plan.querySelectorAll(".plan__block"));
    if (!steps.length || !items.length) continue;

    plan.classList.add("plan--live");

    function select(key) {
      const at = ORDER.indexOf(key);
      for (const step of steps) {
        const index = ORDER.indexOf(step.dataset.step);
        step.setAttribute("aria-pressed", String(index === at));
        step.dataset.state = index < at ? "past" : index === at ? "current" : "future";
      }
      for (const caption of captions) caption.hidden = caption.dataset.caption !== key;
      for (const item of items) {
        const index = ORDER.indexOf(item.dataset.phase);
        item.dataset.state = index < at ? "done" : index === at ? "new" : "future";
      }
      for (const block of blocks) {
        const states = Array.from(block.querySelectorAll("[data-phase]"), (item) => item.dataset.state);
        block.dataset.state = states.includes("new") ? "new" : states.includes("done") ? "done" : "future";
      }
    }

    for (const step of steps) step.addEventListener("click", () => select(step.dataset.step));
    select(DEFAULT_STEP);
  }
})();
