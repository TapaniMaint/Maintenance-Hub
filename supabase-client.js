import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_CONFIG } from "./supabase-config.js";

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
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
