import { supabase } from "./supabase";
import type { Paper } from "../types";

function names(value: unknown) {
  return Array.isArray(value)
    ? value.map((author) => typeof author === "object" && author ? String((author as { name?: unknown }).name ?? "") : "").filter(Boolean).join(", ")
    : "";
}

function mapPaper(row: Record<string, unknown>, index: number): Paper {
  const year = Number(row.conference_year ?? 0);
  const conference = [String(row.conference_name ?? ""), year || ""].filter(Boolean).join(" ");
  return {
    id: String(row.paper_id ?? row.id ?? ""),
    rank: index + 1,
    authorYear: `${names(row.authors).split(",")[0] || String(row.conference_name ?? "Conference")} ${year || ""}`.trim(),
    title: String(row.title ?? ""),
    authors: names(row.authors),
    conference,
    division: row.division ? String(row.division) : undefined,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    rrfScore: 0,
    abstract: String(row.abstract ?? ""),
    sourceUrl: String(row.source_url ?? ""),
  };
}

export const papers = {
  async save(paper: Paper): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, error: "AUTH_REQUIRED" };
    const { error } = await supabase.from("saved_papers").upsert(
      { user_id: data.user.id, paper_id: paper.id },
      { onConflict: "user_id,paper_id", ignoreDuplicates: true },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async remove(paperId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, error: "AUTH_REQUIRED" };
    const { error } = await supabase.from("saved_papers").delete().eq("user_id", data.user.id).eq("paper_id", paperId);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async list(): Promise<Paper[]> {
    const { data, error } = await supabase.rpc("get_my_saved_papers");
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((row, index) => mapPaper(row as Record<string, unknown>, index));
  },

  async exportCsv(ids: string[]): Promise<Blob> {
    const selected = (await this.list()).filter((paper) => ids.includes(paper.id));
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["id", "title", "authors", "conference", "source_url"].map(quote).join(",")];
    for (const paper of selected) rows.push([paper.id, paper.title, paper.authors, paper.conference, paper.sourceUrl].map(quote).join(","));
    return new Blob([`${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  },
};
