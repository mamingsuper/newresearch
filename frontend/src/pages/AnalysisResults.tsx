import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookmarkSimple, ArrowSquareOut, Export, Plus, Info,
  CaretDown, CaretUp, CheckCircle, CopySimple, DownloadSimple
} from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import type { AnalysisReport, InnovationDirection, Paper, ResearchSource } from "../types";
import { sessions } from "../adapters/sessions";

function safeSourceUrl(source: ResearchSource) {
  const value = source.sourceUrl || source.url || "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function ResearchMarkdown({ reportMarkdown }: { reportMarkdown: string }) {
  return (
    <div className="research-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
      >
        {reportMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function SourceCollection({ title, sources }: { title: string; sources: ResearchSource[] }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif font-medium text-base mb-3">{title} <span className="font-mono text-xs" style={{ color: "var(--muted-c)" }}>({sources.length})</span></h2>
      <div className="space-y-2">
        {sources.map((source, index) => {
          const href = safeSourceUrl(source);
          return (
            <details key={`${source.sourceId ?? source.paperId ?? index}-${source.title}`} className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold leading-snug">
                <span className="font-mono mr-2" style={{ color: "var(--accent-c)" }}>{source.sourceId ?? `W${index + 1}`}</span>
                {source.title || href}
              </summary>
              {source.conference && <p className="text-xs mt-2" style={{ color: "var(--muted-c)" }}>{source.conference}</p>}
              {source.abstract && <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--muted-c)" }}>{source.abstract}</p>}
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs mt-3" style={{ color: "var(--accent-c)" }}>
                  <ArrowSquareOut size={12} /> Open source
                </a>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function SuperResearchReport({ report }: { report: AnalysisReport }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  if (!report) return null;
  const reportMarkdown = report.reportMarkdown ?? "";

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportMarkdown);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  function downloadReport() {
    const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `idea-radar-super-report-${report.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-6 rounded-xl p-4 flex items-start gap-3" style={{ background: "var(--signal-dim)", border: "1px solid var(--signal-c)" }}>
        <Info size={16} className="mt-0.5 flex-shrink-0" style={{ color: "var(--signal-c)" }} />
        <div>
          <p className="font-semibold text-sm">SUPER:Apodex · Complete deep-research memo</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted-c)" }}>Conference evidence is labeled C; public web evidence is labeled W. Verify important claims at the linked sources.</p>
        </div>
      </div>
      <section className="card mb-8 overflow-hidden">
        <div className="research-report-toolbar">
          <p className="font-semibold text-sm">Research memo</p>
          <div className="research-report-actions">
            <span className="sr-only" aria-live="polite">
              {copyState === "copied" ? "Report copied" : copyState === "error" ? "Could not copy report" : ""}
            </span>
            <button type="button" onClick={copyReport} className="research-report-action">
              {copyState === "copied" ? <CheckCircle size={15} weight="fill" /> : <CopySimple size={15} />}
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy report"}
            </button>
            <button type="button" onClick={downloadReport} className="research-report-action">
              <DownloadSimple size={15} />
              Download .md
            </button>
          </div>
        </div>
        <div className="p-6">
          <ResearchMarkdown reportMarkdown={reportMarkdown} />
        </div>
      </section>
      <SourceCollection title="Conference corpus sources" sources={report.corpusSources ?? []} />
      <SourceCollection title="Public web sources" sources={report.webSources ?? []} />
      {(report.researchActions?.length ?? 0) > 0 && (
        <section className="mb-8">
          <h2 className="font-serif font-medium text-base mb-3">Research actions</h2>
          <div className="card p-5 space-y-2">
            {report.researchActions?.map((action, index) => (
              <p key={index} className="text-sm leading-relaxed">{action.label || action.detail || action.type || JSON.stringify(action)}</p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ── Paper card ─────────────────────────────────────────────── */
function PaperCard({ paper, isSaved, onSave }: {
  paper: Paper; isSaved: boolean; onSave: () => void;
}) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <article
      className="card"
      style={{ padding: "18px 20px" }}
    >
      {/* Rank + title row */}
      <div className="flex items-start gap-3 mb-2.5">
        <span
          className="font-mono text-xs tabnum mt-0.5 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-[7px]"
          style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}
        >
          {paper.rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--accent-c)" }}>{paper.authorYear}</p>
          <h3 className="font-serif text-sm font-medium leading-snug" style={{ color: "var(--ink)" }}>
            {paper.title}
          </h3>
        </div>
        <button
          onClick={onSave}
          className="flex-shrink-0 p-1.5 rounded-[8px] cursor-pointer transition-colors"
          style={{
            color: isSaved ? "var(--accent-c)" : "var(--muted-c)",
            background: isSaved ? "var(--accent-dim)" : "transparent",
          }}
          aria-label={isSaved ? t("paper_saved", lang) : t("paper_save", lang)}
        >
          <BookmarkSimple size={15} weight={isSaved ? "fill" : "regular"} />
        </button>
      </div>

      {/* Meta pills */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mb-3 pl-10">
        <span className="text-xs" style={{ color: "var(--muted-c)" }}>{paper.authors}</span>
        <span
          className="badge"
          style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}
        >
          {paper.conference}
        </span>
        {paper.division && (
          <span className="badge" style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}>
            {paper.division}
          </span>
        )}
        <span
          className="font-mono text-xs tabnum ml-auto"
          title={t("results_score_note", lang)}
          style={{ color: "var(--muted-c)", opacity: 0.7, cursor: "help" }}
        >
          RRF {paper.rrfScore.toFixed(3)}
        </span>
      </div>

      {/* Abstract toggle */}
      <div className="pl-10">
        <button
          onClick={() => setOpen(x => !x)}
          className="flex items-center gap-1.5 text-xs font-medium mb-2 cursor-pointer"
          style={{ color: open ? "var(--accent-c)" : "var(--muted-c)" }}
          aria-expanded={open}
        >
          {open ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
          {t("paper_abstract", lang)}
        </button>
        {open && (
          <p
            className="text-sm leading-relaxed mb-3 anim-fade-up"
            style={{ color: "var(--ink)", opacity: 0.82, lineHeight: 1.7 }}
          >
            {paper.abstract}
          </p>
        )}
        <a
          href={paper.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--muted-c)" }}
        >
          <ArrowSquareOut size={12} />
          {t("paper_source", lang)}
        </a>
      </div>
    </article>
  );
}

/* ── Section header ─────────────────────────────────────────── */
function SectionLabel({ n, title, muted }: { n: number; title: string; muted?: boolean }) {
  return (
    <div className="section-rule">
      <span
        className="font-mono text-xs flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}
      >
        {n}
      </span>
      <h2
        className="font-serif font-medium text-base flex-shrink-0"
        style={{ color: muted ? "var(--muted-c)" : "var(--ink)" }}
      >
        {title}
      </h2>
    </div>
  );
}

/* ── Main results page ──────────────────────────────────────── */
export default function AnalysisResults() {
  const { lang, currentReport, setCurrentReport, savedPaperIds, toggleSavedPaper, user, setShowAuth } = useApp();
  const navigate = useNavigate();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");

  if (!currentReport) { navigate("/"); return null; }
  const r = currentReport;

  async function handleSave() {
    if (!user) { setShowAuth(true); return; }
    setSaveState("saving");
    const result = await sessions.save(r);
    if (result.ok) setSaveState("saved");
    else { setSaveState("idle"); setSaveError(result.error); }
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `idea-radar-report-${r.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function scrollToPaper(id: string) {
    document.getElementById(`paper-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="product-page anim-fade-up">

      {/* ── Top action bar ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
          style={{
            background: saveState === "saved" ? "var(--success-dim)" : "var(--accent-dim)",
            color: saveState === "saved" ? "var(--success-c)" : "var(--accent-c)",
          }}
        >
          {saveState === "saved" ? <CheckCircle size={14} weight="duotone" /> : <BookmarkSimple size={14} />}
          {saveState === "saved" ? t("results_saved", lang) : t("results_save", lang)}
        </button>
        <button
          onClick={exportReport}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-sm font-medium cursor-pointer"
          style={{ background: "var(--surface-subtle)", color: "var(--muted-c)", border: "1px solid var(--border-c)" }}
        >
          <Export size={14} />
          {t("results_export", lang)}
        </button>
        <button
          onClick={() => { setCurrentReport(null); navigate("/"); }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-sm font-semibold cursor-pointer ml-auto"
          style={{ background: "var(--accent-c)", color: "#fff" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.88"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
        >
          <Plus size={14} />
          {t("results_new", lang)}
        </button>
      </div>

      {saveError && <div className="card p-4 mb-5 text-sm" role="alert" style={{ color: "var(--danger-c)" }}>{saveError}</div>}

      {r.kind === "super_apodex" ? (
        <SuperResearchReport report={r} />
      ) : <>

      {/* ── 1 · Idea profile ───────────────────────────── */}
      <section className="mb-8">
        <SectionLabel n={1} title={t("results_idea_profile", lang)} />
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink)", opacity: 0.85, lineHeight: 1.75 }}>
          {r.ideaProfile}
        </p>
      </section>

      {/* ── 2 · Corpus notice ──────────────────────────── */}
      <section className="mb-8">
        <SectionLabel n={2} title={t("results_corpus_notice", lang)} muted />
        <div
          className="flex gap-3 rounded-xl px-4 py-3.5"
          style={{ background: "var(--surface-subtle)", border: "1px solid var(--border-c)" }}
        >
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--muted-c)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-c)", lineHeight: 1.65 }}>
            {r.corpusNotice}
          </p>
        </div>
      </section>

      {/* ── 3 · Closest work ───────────────────────────── */}
      <section className="mb-8">
        <SectionLabel n={3} title={t("results_closest_work", lang)} />
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink)", opacity: 0.85, lineHeight: 1.75 }}>
          {r.closestWork}
        </p>
      </section>

      {/* ── 4 · Innovation directions ──────────────────── */}
      <section className="mb-8">
        <SectionLabel n={4} title={t("results_innovation", lang)} />
        <div className="space-y-3">
          {r.innovationDirections.map((dir: InnovationDirection, i: number) => (
            <div
              key={i}
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border-c)", boxShadow: "var(--shadow-xs)" }}
            >
              <h4 className="font-serif font-medium text-sm mb-2 leading-snug" style={{ color: "var(--ink)" }}>
                {dir.title}
              </h4>
              <p className="text-sm leading-relaxed mb-3.5" style={{ color: "var(--ink)", opacity: 0.8, lineHeight: 1.7 }}>
                {dir.body}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dir.citations.map(c => (
                  <button
                    key={c.paperId}
                    onClick={() => scrollToPaper(c.paperId)}
                    className="badge cursor-pointer transition-colors hover:opacity-80"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-c)", padding: "3px 10px", borderRadius: 7 }}
                  >
                    ↓ {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5 · Next steps ─────────────────────────────── */}
      <section className="mb-8">
        <SectionLabel n={5} title={t("results_next_steps", lang)} />
        <ol className="space-y-3">
          {r.nextSteps.map((step: string, i: number) => (
            <li key={i} className="flex gap-3">
              <span
                className="font-mono text-xs tabnum flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "var(--surface-subtle)", color: "var(--muted-c)", fontSize: "0.78rem" }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--ink)", opacity: 0.85, lineHeight: 1.7 }}>
                {step}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 6 · Limitations ────────────────────────────── */}
      <section className="mb-8">
        <SectionLabel n={6} title={t("results_limitations", lang)} muted />
        <ul className="space-y-2">
          {r.limitations.map((lim: string, i: number) => (
            <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--muted-c)", lineHeight: 1.65 }}>
              <span className="flex-shrink-0 mt-px" style={{ fontSize: "0.8rem" }}>-</span>
              <span>{lim}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 7 · Related papers ─────────────────────────── */}
      <section className="mb-10">
        <SectionLabel n={7} title={t("results_papers", lang)} />
        <p className="text-xs mb-4" style={{ color: "var(--muted-c)" }}>
          <span className="font-mono tabnum">{r.papers.length}</span> {t("results_papers_count", lang)}{" · "}
          <span style={{ borderBottom: "1px dotted var(--muted-c)", cursor: "help" }} title={t("results_score_note", lang)}>
            {t("results_score_note", lang)}
          </span>
        </p>
        <div className="space-y-3">
          {r.papers.map((paper: Paper) => (
            <div key={paper.id} id={`paper-${paper.id}`}>
              <PaperCard
                paper={paper}
                isSaved={savedPaperIds.has(paper.id)}
                onSave={() => toggleSavedPaper(paper)}
              />
            </div>
          ))}
        </div>
      </section>
      </>}
    </div>
  );
}
