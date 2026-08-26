export interface RuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

declare global {
  interface Window {
    __IDEA_RADAR_CONFIG__?: RuntimeConfig;
  }
}

function cleanUrl(value: string, name: string) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`${name}_must_use_https`);
  }
  return url.toString().replace(/\/$/, "");
}

export function runtimeConfig(): RuntimeConfig {
  const config = window.__IDEA_RADAR_CONFIG__;
  if (!config?.apiBaseUrl || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("public_runtime_config_missing");
  }
  return {
    apiBaseUrl: cleanUrl(config.apiBaseUrl, "apiBaseUrl"),
    supabaseUrl: cleanUrl(config.supabaseUrl, "supabaseUrl"),
    supabasePublishableKey: config.supabasePublishableKey.trim(),
  };
}

export function appRedirectUrl() {
  const base = window.location.hostname.endsWith("github.io") ? "/newresearch/" : "/";
  return new URL(base, window.location.origin).toString();
}
