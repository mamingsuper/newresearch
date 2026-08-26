import { publicEdgeFetch } from "./supabase";
import type { CorpusLibraryPage, CorpusPaper } from "../types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function paper(value: unknown): CorpusPaper {
  const row = record(value);
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    abstract: String(row.abstract ?? ""),
    authors: Array.isArray(row.authors) ? row.authors.map(record) : [],
    conferenceSlug: String(row.conferenceSlug ?? ""),
    conferenceName: String(row.conferenceName ?? ""),
    conferenceYear: Number(row.conferenceYear ?? 0),
    division: row.division ? String(row.division) : undefined,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    sourceUrl: String(row.sourceUrl ?? ""),
  };
}

export const conferences = {
  async list({ query = "", conference = "", page = 1 }: { query?: string; conference?: string; page?: number } = {}): Promise<CorpusLibraryPage> {
    const params = new URLSearchParams({ page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (conference) params.set("conference", conference);
    const response = await publicEdgeFetch(`corpus-library?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message ?? "Conference library is unavailable.");
    const data = record(payload.data);
    return {
      papers: (Array.isArray(data.papers) ? data.papers : []).map(paper),
      total: Number(data.total ?? 0),
      page: Number(data.page ?? page),
      limit: Number(data.limit ?? 20),
    };
  },
};
