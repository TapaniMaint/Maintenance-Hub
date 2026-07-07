import { SUPABASE_CONFIG } from "./supabase-config.js";

const { createClient } = window.supabase || {};

const AUTH_THROTTLE_KEY = "maintenanceHubAuthThrottle_v1";
const AUTH_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_THROTTLE_LOCK_MS = 5 * 60 * 1000;
const AUTH_THROTTLE_MAX_FAILURES = 5;

export const supabase = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

function readRole(user) {
  const role = user?.app_metadata?.role;
  if (typeof role === "string") return role;

  const roles = user?.app_metadata?.roles;
  if (Array.isArray(roles) && roles.includes("admin")) return "admin";

  return "";
}

function throttleKey(email) {
  const value = String(email || "").trim().toLowerCase();
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `email_${(hash >>> 0).toString(36)}`;
}

function readAuthThrottle() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_THROTTLE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAuthThrottle(throttle) {
  try {
    localStorage.setItem(AUTH_THROTTLE_KEY, JSON.stringify(throttle));
  } catch {
  }
}

function assertAuthNotThrottled(email) {
  const key = throttleKey(email);
  const entry = readAuthThrottle()[key];
  if (!entry?.lockedUntil) return;

  if (Date.now() < entry.lockedUntil) {
    throw new Error("Too many sign-in attempts. Try again in a few minutes.");
  }
}

function recordAuthSuccess(email) {
  const key = throttleKey(email);
  const throttle = readAuthThrottle();
  delete throttle[key];
  writeAuthThrottle(throttle);
}

function recordAuthFailure(email) {
  const key = throttleKey(email);
  const now = Date.now();
  const throttle = readAuthThrottle();
  const current = throttle[key];
  const failures = current?.firstFailureAt && now - current.firstFailureAt < AUTH_THROTTLE_WINDOW_MS
    ? (current.failures || 0) + 1
    : 1;

  throttle[key] = {
    failures,
    firstFailureAt: failures === 1 ? now : current.firstFailureAt,
    lockedUntil: failures >= AUTH_THROTTLE_MAX_FAILURES ? now + AUTH_THROTTLE_LOCK_MS : 0
  };
  writeAuthThrottle(throttle);
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? "";
}

export async function isAdminUser() {
  const user = await getUser();
  return readRole(user) === "admin";
}

export async function requireAdminAccessToken() {
  const session = await getSession();
  if (!session?.access_token) {
    throw new Error("Sign in with an admin account to make changes.");
  }

  if (readRole(session.user) !== "admin") {
    throw new Error("This account is signed in, but it does not have the admin role.");
  }

  return session.access_token;
}

export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");
  assertAuthNotThrottled(email);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    recordAuthFailure(email);
    throw error;
  }
  recordAuthSuccess(email);
  return data.session ?? null;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  return supabase.auth.onAuthStateChange((_event, session) => {
    callback?.(session ?? null);
  });
}
