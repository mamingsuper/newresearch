import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { appRedirectUrl } from "./runtime";

export const auth = {
  async signInWithEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!email.includes("@")) return { ok: false, error: "invalid_email" };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appRedirectUrl() },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async signInWithGoogle(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appRedirectUrl() },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback).data.subscription;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
