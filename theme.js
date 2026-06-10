(() => {
  const THEME_KEY = "maintenanceHubTheme_v1";

  try {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
    const theme = stored === "light" || stored === "dark"
      ? stored
      : prefersLight
        ? "light"
        : "dark";

    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
