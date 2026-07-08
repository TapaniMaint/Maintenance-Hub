import { getUser, onAuthStateChange } from "./supabase-client.js";

const THEME_KEY = "maintenanceHubTheme_v1";
const THEMES = new Set(["dark", "light", "forest", "steel"]);
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsPanel = document.getElementById("settingsPanel");
const themeModeInputs = [...document.querySelectorAll('input[name="themeMode"]')];

function redirectToLogin() {
  window.location.assign("/login.html");
}

function currentTheme() {
  const theme = document.documentElement.dataset.theme;
  return THEMES.has(theme) ? theme : "dark";
}

function syncThemeToggle() {
  const theme = currentTheme();
  themeModeInputs.forEach((input) => {
    input.checked = input.value === theme;
  });
}

function setTheme(theme) {
  const nextTheme = THEMES.has(theme) ? theme : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  syncThemeToggle();
}

function syncSettingsPanelState() {
  settingsToggleBtn?.setAttribute("aria-expanded", String(!settingsPanel?.hidden));
}

function openSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.hidden = false;
  syncSettingsPanelState();
}

function closeSettingsPanel() {
  if (!settingsPanel) return;
  settingsPanel.hidden = true;
  syncSettingsPanelState();
}

function toggleSettingsPanel() {
  if (settingsPanel?.hidden) openSettingsPanel();
  else closeSettingsPanel();
}

settingsToggleBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSettingsPanel();
});
settingsPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
themeModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) setTheme(input.value);
  });
});
document.addEventListener("click", closeSettingsPanel);
syncThemeToggle();
syncSettingsPanelState();

getUser()
  .then((user) => {
    if (!user) redirectToLogin();
    else document.body.classList.remove("auth-checking");
  })
  .catch(() => {
    redirectToLogin();
  });

onAuthStateChange((session) => {
  if (!session?.user) redirectToLogin();
});
