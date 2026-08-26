import { edgeFetch, supabase } from "./supabase";
import { restoreStoredReport } from "./analysis";
import type { AnalysisReport, ConversationSummary } from "../types";

function summary(row: Record<string, unknown>): ConversationSummary {
  const ideaText = String(row.idea_text ?? "");
  const corpus = row.corpus_snapshot && typeof row.corpus_snapshot === "object" ? row.corpus_snapshot as Record<string, unknown> : {};
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "Untitled analysis"),
    ideaSnippet: ideaText,
    ideaText,
    lang: row.language === "zh" ? "zh" : "en",
    paperCount: Number(corpus.paperCount ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    report: row.report && typeof row.report === "object" ? row.report as Record<string, unknown> : null,
  };
}

export const sessions = {
  async save(report: AnalysisReport): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!report.rawReport) return { ok: false, error: "REPORT_UNAVAILABLE" };
    const language = /[\u3400-\u9fff]/u.test(report.idea) ? "zh" : "en";
    const response = await edgeFetch("save-analysis", {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: crypto.randomUUID(),
        title: report.idea.trim().slice(0, 120),
        ideaText: report.idea,
        report: report.rawReport,
        language,
        corpusSnapshot: {
          ready: true,
          paperCount: 8906,
          papersWithAbstract: 8906,
          embeddedPaperCount: 8906,
          pendingEmbeddingCount: 0,
          failedEmbeddingCount: 0,
          conferences: [
            { slug: "apsa-2026", name: "APSA", year: 2026, papers: 5493 },
            { slug: "ica-2026", name: "ICA", year: 2026, papers: 3413 },
          ],
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok ? { ok: true } : { ok: false, error: payload?.error?.code ?? "SAVE_UNAVAILABLE" };
  },

  async list(): Promise<ConversationSummary[]> {
    const { data, error } = await supabase.from("analysis_sessions")
      .select("id,title,idea_text,report,language,corpus_snapshot,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => summary(row as Record<string, unknown>));
  },

  async reopen(id: string): Promise<AnalysisReport> {
    const { data, error } = await supabase.from("analysis_sessions")
      .select("id,idea_text,report")
      .eq("id", id)
      .single();
    if (error || !data?.report || typeof data.report !== "object") throw error ?? new Error("SESSION_NOT_FOUND");
    return restoreStoredReport(String(data.idea_text ?? ""), data.report as Record<string, unknown>, String(data.id));
  },

  async rename(id: string, title: string) {
    const clean = title.trim();
    if (!clean || clean.length > 200) return { ok: false as const, error: "INVALID_TITLE" };
    const { error } = await supabase.from("analysis_sessions").update({ title: clean }).eq("id", id);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  },

  async delete(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await supabase.from("analysis_sessions").delete().eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
};
