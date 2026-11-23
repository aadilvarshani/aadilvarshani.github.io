// Theme button: switches between light and dark and remembers the choice.
// The button ships hidden so it never appears on pages without JS.
(function initThemeToggle() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;

  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  const currentTheme = () => root.dataset.theme || (prefersDark.matches ? "dark" : "light");
  const oppositeOf = (theme) => (theme === "dark" ? "light" : "dark");

  function render() {
    const next = oppositeOf(currentTheme());
    button.textContent = next === "dark" ? "Dark" : "Light";
    button.setAttribute("aria-label", `Switch to ${next} theme`);
  }

  function rememberTheme(theme) {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // storage blocked: the choice lasts for this page view only
    }
  }

  button.addEventListener("click", () => {
    const next = oppositeOf(currentTheme());
    root.dataset.theme = next;
    rememberTheme(next);
    render();
  });
  prefersDark.addEventListener("change", render);

  render();
  button.hidden = false;
})();
