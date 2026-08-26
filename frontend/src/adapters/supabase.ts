import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "./runtime";

const config = runtimeConfig();

export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});

export async function accessToken() {
  const token = await optionalAccessToken();
  if (!token) throw new Error("AUTH_REQUIRED");
  return token;
}

export async function optionalAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function edgeFetch(path: string, init: RequestInit = {}) {
  const { apiBaseUrl } = runtimeConfig();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await accessToken()}`);
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${apiBaseUrl}/${path.replace(/^\//, "")}`, { ...init, headers, cache: "no-store" });
}

export async function publicEdgeFetch(path: string, init: RequestInit = {}) {
  const { apiBaseUrl } = runtimeConfig();
  const headers = new Headers(init.headers);
  const token = await optionalAccessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${apiBaseUrl}/${path.replace(/^\//, "")}`, { ...init, headers, cache: "no-store" });
}
