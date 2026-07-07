(() => {
  const THEME_KEY = "maintenanceHubTheme_v1";
  const THEMES = new Set(["dark", "light", "forest", "steel"]);

  try {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
    const theme = THEMES.has(stored)
      ? stored
      : prefersLight
        ? "light"
        : "dark";

    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
