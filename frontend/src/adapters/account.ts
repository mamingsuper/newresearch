import { edgeFetch } from "./supabase";

export const account = {
  async exportData(): Promise<Blob> {
    const response = await edgeFetch("export-account");
    if (!response.ok) throw new Error("EXPORT_UNAVAILABLE");
    return response.blob();
  },

  async deleteAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
    const response = await edgeFetch("delete-account", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok ? { ok: true } : { ok: false, error: payload?.error?.code ?? "DELETE_UNAVAILABLE" };
  },
};
