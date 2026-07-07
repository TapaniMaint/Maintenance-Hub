import {
  getUser,
  onAuthStateChange,
  signInWithPassword
} from "./supabase-client.js";

const THEME_KEY = "maintenanceHubTheme_v1";
const THEMES = new Set(["dark", "light", "forest", "steel"]);

const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("userEmail");
const passwordInput = document.getElementById("userPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const statusBanner = document.getElementById("statusBanner");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsPanel = document.getElementById("settingsPanel");
const themeModeInputs = [...document.querySelectorAll('input[name="themeMode"]')];

function applyStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (THEMES.has(stored)) {
      document.documentElement.dataset.theme = stored;
    }
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
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

function setStatus(message, type = "info") {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function showError(error, message) {
  console.warn(message, error);
  setStatus(message, "error");
}

function redirectToUserPortal() {
  window.location.assign("/index.html");
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

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput?.value.trim() || "";
  const password = passwordInput?.value || "";
  if (!email || !password) return;

  authSubmitBtn.disabled = true;
  setStatus("Signing in...", "info");

  try {
    await signInWithPassword(email, password);
    passwordInput.value = "";
    redirectToUserPortal();
  } catch (error) {
    showError(error, "Authentication failed.");
  } finally {
    authSubmitBtn.disabled = false;
  }
});

applyStoredTheme();
syncThemeToggle();
syncSettingsPanelState();

getUser()
  .then((user) => {
    if (user) redirectToUserPortal();
  })
  .catch((error) => {
    showError(error, "Unable to check session.");
  });

onAuthStateChange((session) => {
  if (session?.user) redirectToUserPortal();
});
