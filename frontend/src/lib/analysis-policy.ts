export const MAX_ANALYSIS_FILE_BYTES = 6 * 1024 * 1024;

export type AnalysisTier = "anonymous" | "free" | "pro";

export interface AnalysisAccess {
  tier: AnalysisTier;
  matchCounts: readonly (5 | 10 | 20 | 100)[];
  defaultMatchCount: 5 | 10 | 20;
  maxAttachments: 1 | 3;
  canUseSuper: boolean;
  quotaLabel: string;
}

type UserAccess = {
  plan: "free" | "pro";
  analysesRemainingToday: number;
};

export function analysisAccessFor(user: UserAccess | null): AnalysisAccess {
  if (!user) {
    return {
      tier: "anonymous",
      matchCounts: [5],
      defaultMatchCount: 5,
      maxAttachments: 1,
      canUseSuper: false,
      quotaLabel: "1 preview",
    };
  }
  if (user.plan === "pro") {
    return {
      tier: "pro",
      matchCounts: [20, 100],
      defaultMatchCount: 20,
      maxAttachments: 3,
      canUseSuper: true,
      quotaLabel: "Unlimited",
    };
  }
  return {
    tier: "free",
    matchCounts: [10],
    defaultMatchCount: 10,
    maxAttachments: 3,
    canUseSuper: false,
    quotaLabel: `${Math.max(0, user.analysesRemainingToday)} today`,
  };
}

type FileDescriptor = Pick<File, "name" | "size" | "type">;
type AttachmentValidation = { ok: true } | {
  ok: false;
  code: "INVALID_NAME" | "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE";
};

const ALLOWED_EXTENSIONS = new Set(["pdf", "md", "markdown", "txt"]);
const ALLOWED_MIME_TYPES = new Set([
  "",
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

export function validateAnalysisAttachment(file: FileDescriptor): AttachmentValidation {
  const name = file.name.normalize("NFKC").trim();
  if (!name || name.length > 255 || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return { ok: false, code: "INVALID_NAME" };
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1) return { ok: false, code: "EMPTY_FILE" };
  if (file.size > MAX_ANALYSIS_FILE_BYTES) return { ok: false, code: "FILE_TOO_LARGE" };
  const extension = name.includes(".") ? name.split(".").at(-1)?.toLowerCase() ?? "" : "";
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return { ok: false, code: "UNSUPPORTED_TYPE" };
  }
  return { ok: true };
}
