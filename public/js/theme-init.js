// Applies a stored theme choice before first paint. Loaded (not deferred) in <head>.
// Without a stored choice the OS preference applies through CSS color-scheme.
(function applyStoredTheme() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem("theme");
  } catch {
    return; // storage blocked: fall back to the OS preference
  }
  if (storedTheme === "light" || storedTheme === "dark") {
    document.documentElement.dataset.theme = storedTheme;
  }
})();
