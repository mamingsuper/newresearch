export interface Paper {
  id: string;
  rank: number;
  authorYear: string;
  title: string;
  authors: string;
  conference: string;
  division?: string;
  keywords?: string[];
  rrfScore: number;
  abstract: string;
  sourceUrl: string;
}

export interface InnovationDirection {
  title: string;
  body: string;
  citations: { paperId: string; label: string }[];
}

export interface ResearchSource {
  sourceId?: string;
  paperId?: string;
  title: string;
  conference?: string;
  abstract?: string;
  sourceUrl?: string;
  url?: string;
}

export interface ResearchAction {
  type?: string;
  label?: string;
  detail?: string;
  url?: string;
}

export interface AnalysisReport {
  id: string;
  kind: "default" | "super_apodex";
  idea: string;
  createdAt: string;
  ideaProfile: string;
  corpusNotice: string;
  closestWork: string;
  innovationDirections: InnovationDirection[];
  nextSteps: string[];
  limitations: string[];
  papers: Paper[];
  reportMarkdown?: string;
  corpusSources?: ResearchSource[];
  webSources?: ResearchSource[];
  researchActions?: ResearchAction[];
  rawReport?: Record<string, unknown>;
}

export interface AnalysisOptions {
  model: "default" | "super_apodex";
  effort: "standard" | "high";
  matchCount: 5 | 10 | 20 | 100;
  externalProcessingConsent: boolean;
  clientRequestId: string;
  attachments: AnalysisAttachment[];
}

export interface AnalysisAttachment {
  clientId: string;
  file: File;
  status: "ready" | "uploading" | "parsed" | "error";
  attachmentId?: string;
  characters?: number;
  error?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  ideaSnippet: string;
  ideaText: string;
  lang: "en" | "zh";
  paperCount: number;
  createdAt: string;
  updatedAt: string;
  report: Record<string, unknown> | null;
}

export interface Conference {
  id: string;
  name: string;
  acronym: string;
  year: number;
  discipline: string;
  paperCount: number;
  abstractCoverage: number;
  vectorCoverage: number;
  officialUrl: string;
  programUrl?: string;
  provenanceNote?: string;
  lastVerified: string;
}

export interface CorpusPaper {
  id: string;
  title: string;
  abstract: string;
  authors: { name?: string; [key: string]: unknown }[];
  conferenceSlug: string;
  conferenceName: string;
  conferenceYear: number;
  division?: string;
  keywords: string[];
  sourceUrl: string;
}

export interface CorpusLibraryPage {
  papers: CorpusPaper[];
  total: number;
  page: number;
  limit: number;
}
