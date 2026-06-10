import {
  getUser,
  onAuthStateChange,
  signInWithPassword
} from "./supabase-client.js";

const THEME_KEY = "maintenanceHubTheme_v1";

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
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemeToggle() {
  const theme = currentTheme();
  themeModeInputs.forEach((input) => {
    input.checked = input.value === theme;
  });
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
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
    setStatus(error.message || "Authentication failed.", "error");
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
    setStatus(error.message || "Unable to check session.", "error");
  });

onAuthStateChange((session) => {
  if (session?.user) redirectToUserPortal();
});
