import { edgeFetch, optionalAccessToken, publicEdgeFetch } from "./supabase";
import type { AnalysisOptions, AnalysisReport, Paper, ResearchSource } from "../types";
import { getOrCreateAnonymousId } from "../lib/anonymous-identity";

export type ProgressStep = {
  step: number;
  label: string;
  status: "pending" | "active" | "done";
};

export const PROGRESS_STEPS = [
  "Understanding the research question",
  "Reading the corpus scope",
  "Generating the query embedding",
  "Running hybrid retrieval",
  "Ranking relevant papers",
  "Generating grounded analysis",
  "Checking citations",
  "Report ready",
];

const ACTIVE_JOB_KEY = "idea-radar-active-research-job";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function authorNames(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((author) => text(asRecord(author).name)).filter(Boolean).join(", ");
}

function paperFrom(value: unknown, index: number): Paper {
  const paper = asRecord(value);
  return {
    id: text(paper.paperId ?? paper.id) || `paper-${index + 1}`,
    rank: Number(paper.rank ?? index + 1),
    authorYear: text(paper.authorYearLabel ?? paper.authorYear) || text(paper.conference),
    title: text(paper.title),
    authors: authorNames(paper.authors),
    conference: text(paper.conference),
    division: text(paper.division) || undefined,
    keywords: strings(paper.keywords),
    rrfScore: Number(paper.score ?? paper.retrievalScore ?? paper.rrfScore ?? 0),
    abstract: text(paper.abstract ?? paper.evidence),
    sourceUrl: text(paper.sourceUrl),
  };
}

function sourceFrom(value: unknown): ResearchSource {
  const source = asRecord(value);
  return {
    sourceId: text(source.sourceId) || undefined,
    paperId: text(source.paperId) || undefined,
    title: text(source.title),
    conference: text(source.conference) || undefined,
    abstract: text(source.abstract) || undefined,
    sourceUrl: text(source.sourceUrl) || undefined,
    url: text(source.url) || undefined,
  };
}

function normalizeDefault(idea: string, data: unknown, meta: unknown): AnalysisReport {
  const report = asRecord(data);
  const metadata = asRecord(meta);
  const profile = asRecord(report.ideaProfile);
  const closest = Array.isArray(report.closestWork) ? report.closestWork.map(asRecord) : [];
  const paths = Array.isArray(report.innovationPaths) ? report.innovationPaths.map(asRecord) : [];
  return {
    id: text(metadata.jobId) || crypto.randomUUID(),
    kind: "default",
    idea,
    createdAt: new Date().toISOString(),
    ideaProfile: text(profile.summary) || idea,
    corpusNotice: text(report.coverageNotice),
    closestWork: closest.map((work) => [text(work.title), text(work.relationship), text(work.evidence)].filter(Boolean).join(" — ")).join("\n\n"),
    innovationDirections: paths.map((path) => ({
      title: text(path.title),
      body: text(path.rationale),
      citations: (Array.isArray(path.evidenceReferences) ? path.evidenceReferences : []).map((value) => {
        const citation = asRecord(value);
        return { paperId: text(citation.paperId), label: text(citation.authorYearLabel) || text(citation.title) };
      }),
    })),
    nextSteps: strings(report.recommendedNextSteps),
    limitations: strings(report.limitations),
    papers: (Array.isArray(report.relatedPapers) ? report.relatedPapers : []).map(paperFrom),
    rawReport: report,
  };
}

function normalizeSuper(idea: string, data: unknown): AnalysisReport {
  const result = asRecord(data);
  const corpusSources = (Array.isArray(result.corpusSources) ? result.corpusSources : []).map(sourceFrom);
  const webSources = (Array.isArray(result.webSources) ? result.webSources : []).map(sourceFrom);
  return {
    id: text(result.jobId) || crypto.randomUUID(),
    kind: "super_apodex",
    idea,
    createdAt: new Date().toISOString(),
    ideaProfile: idea,
    corpusNotice: "SUPER deep research combines the selected conference evidence with cited public web research.",
    closestWork: "",
    innovationDirections: [],
    nextSteps: [],
    limitations: [],
    papers: corpusSources.map(paperFrom),
    reportMarkdown: text(result.reportMarkdown),
    corpusSources,
    webSources,
    researchActions: Array.isArray(result.researchActions) ? result.researchActions.map((value) => asRecord(value)) : [],
    rawReport: {
      kind: "super_apodex",
      reportMarkdown: text(result.reportMarkdown),
      corpusSources,
      webSources,
      researchActions: Array.isArray(result.researchActions) ? result.researchActions.map((value) => asRecord(value)) : [],
    },
  };
}

export function restoreStoredReport(idea: string, data: Record<string, unknown>, id: string): AnalysisReport {
  return data.kind === "super_apodex"
    ? { ...normalizeSuper(idea, { ...data, jobId: id }), id }
    : { ...normalizeDefault(idea, data, { jobId: id }), id };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? "Analysis could not be completed.");
    Object.assign(error, { code: payload?.error?.code ?? "ANALYSIS_FAILED", status: response.status });
    throw error;
  }
  return payload;
}

async function uploadAttachment(file: File, anonymousId: string | null) {
  const form = new FormData();
  if (anonymousId) form.set("anonymousId", anonymousId);
  form.set("file", file);
  const response = await publicEdgeFetch("extract-analysis-attachment", { method: "POST", body: form });
  const payload = await responsePayload(response);
  const data = asRecord(payload.data);
  const attachmentId = text(data.attachmentId);
  if (!attachmentId) throw new Error("Attachment could not be processed.");
  return attachmentId;
}

async function pollJob(idea: string, jobId: string, onProgress: (step: number, pct: number) => void) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (attempt > 0) await wait(5000);
    const response = await edgeFetch(`analysis-job-status?id=${encodeURIComponent(jobId)}`);
    if (response.status === 503) continue;
    const payload = await responsePayload(response);
    const data = asRecord(payload.data);
    if (data.status === "failed") throw Object.assign(new Error("Deep research could not be completed."), { code: text(data.errorCode) });
    if (data.status === "completed" && text(data.reportMarkdown)) {
      sessionStorage.removeItem(ACTIVE_JOB_KEY);
      onProgress(PROGRESS_STEPS.length, 100);
      return normalizeSuper(idea, data);
    }
    onProgress(6, Math.min(96, 72 + Math.floor(attempt / 4)));
  }
  throw Object.assign(new Error("Deep research is still running. Return to this page to resume it."), { code: "RESEARCH_TIMEOUT" });
}

export const analysis = {
  async run(
    idea: string,
    options: AnalysisOptions,
    onProgress: (step: number, pct: number) => void
  ): Promise<AnalysisReport> {
    const saved = sessionStorage.getItem(ACTIVE_JOB_KEY);
    if (options.model === "super_apodex" && saved) {
      const active = asRecord(JSON.parse(saved));
      if (text(active.idea) === idea && text(active.jobId)) {
        onProgress(6, 72);
        return pollJob(idea, text(active.jobId), onProgress);
      }
    }

    onProgress(1, 8);
    const authenticated = Boolean(await optionalAccessToken());
    const anonymousId = authenticated ? null : getOrCreateAnonymousId();
    const attachmentIds = await Promise.all(options.attachments.map((attachment) =>
      attachment.attachmentId
        ? Promise.resolve(attachment.attachmentId)
        : uploadAttachment(attachment.file, anonymousId)
    ));
    onProgress(2, 18);
    const response = await publicEdgeFetch("analyze-idea", {
      method: "POST",
      body: JSON.stringify({
        idea,
        model: options.model,
        effort: options.effort,
        matchCount: options.matchCount,
        anonymousId,
        attachmentIds,
        clientRequestId: options.clientRequestId,
        externalProcessingConsent: options.externalProcessingConsent,
      }),
    });
    onProgress(5, 68);
    const payload = await responsePayload(response);
    if (response.status === 202) {
      const jobId = text(payload?.data?.jobId);
      if (!jobId) throw new Error("Deep research job did not return an id.");
      sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId, idea, options }));
      return pollJob(idea, jobId, onProgress);
    }
    onProgress(PROGRESS_STEPS.length, 100);
    return normalizeDefault(idea, payload.data, payload.meta);
  },
};
