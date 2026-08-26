import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, Books, CaretLeft, CaretRight, Info, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { conferences as conferenceAdapter } from "../adapters/conferences";
import type { CorpusPaper } from "../types";
import { ContentSkeleton } from "../components/ContentSkeleton";
import { EmptyState } from "../components/EmptyState";

export default function ConferenceLibrary() {
  const { lang } = useApp();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("");
  const [page, setPage] = useState(1);
  const [papers, setPapers] = useState<CorpusPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(draft.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    conferenceAdapter.list({ query, conference, page })
      .then((result) => {
        if (!active) return;
        setPapers(result.papers);
        setTotal(result.total);
      })
      .catch(() => {
        if (active) setError(lang === "en" ? "Conference papers are temporarily unavailable." : "会议论文暂时不可用。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conference, lang, page, query]);

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const visibleRange = useMemo(() => {
    if (!total) return "0";
    const start = (page - 1) * 20 + 1;
    return `${start.toLocaleString()}–${Math.min(page * 20, total).toLocaleString()}`;
  }, [page, total]);

  return (
    <div className="product-page anim-fade-up">
      <header className="library-heading" data-reveal>
        <div>
          <p className="section-kicker">02 · {lang === "zh" ? "真实会议语料" : "LIVE CONFERENCE CORPUS"}</p>
          <h1 className="font-semibold tracking-tight text-2xl mb-1" style={{ color: "var(--ink)" }}>{t("library_title", lang)}</h1>
          <p className="text-sm" style={{ color: "var(--muted-c)" }}>
            {lang === "zh" ? "搜索 APSA 2026 与 ICA 2026 的 8,906 篇论文及完整摘要。" : "Search 8,906 papers and full abstracts from APSA 2026 and ICA 2026."}
          </p>
        </div>
        <div className="library-total"><span>8,906</span><small>{lang === "zh" ? "已索引论文" : "indexed papers"}</small></div>
      </header>

      <section className="library-controls" aria-label={lang === "zh" ? "论文筛选" : "Paper filters"} data-reveal>
        <label className="library-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={lang === "zh" ? "搜索标题、摘要或关键词…" : "Search titles, abstracts, or keywords…"}
            aria-label={lang === "zh" ? "搜索论文" : "Search papers"}
          />
        </label>
        <div className="library-filter-row" role="group" aria-label={lang === "zh" ? "会议" : "Conference"}>
          {[
            ["", lang === "zh" ? "全部" : "All"],
            ["apsa-2026", "APSA 2026"],
            ["ica-2026", "ICA 2026"],
          ].map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              className={conference === value ? "is-active" : ""}
              onClick={() => { setConference(value); setPage(1); }}
            >{label}</button>
          ))}
        </div>
      </section>

      <div className="library-result-meta" data-reveal>
        <span>{loading ? (lang === "zh" ? "正在读取语料…" : "Reading corpus…") : `${total.toLocaleString()} ${lang === "zh" ? "篇论文" : total === 1 ? "paper" : "papers"}`}</span>
        {!loading && total > 0 && <span>{visibleRange} / {total.toLocaleString()}</span>}
      </div>

      {error ? (
        <EmptyState
          tone="danger"
          icon={<Warning size={28} weight="duotone" />}
          title={lang === "zh" ? "无法读取会议语料" : "Conference corpus unavailable"}
          description={error}
        />
      ) : loading ? (
        <ContentSkeleton variant="library" label={t("loading", lang)} />
      ) : papers.length === 0 ? (
        <EmptyState
          icon={<Books size={28} weight="duotone" />}
          title={lang === "zh" ? "没有找到匹配论文" : "No matching papers"}
          description={lang === "zh" ? "尝试更短的术语或切换会议。" : "Try a shorter term or switch conferences."}
          action={(query || conference) ? (
            <button type="button" className="surface-action" onClick={() => { setDraft(""); setQuery(""); setConference(""); setPage(1); }}>
              {lang === "zh" ? "清除筛选" : "Clear filters"}
            </button>
          ) : undefined}
        />
      ) : (
        <div className="library-paper-list stagger-list" data-reveal>
          {papers.map((paper, index) => <PaperCard key={paper.id} paper={paper} index={(page - 1) * 20 + index + 1} lang={lang} />)}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <nav className="library-pagination" aria-label={lang === "zh" ? "分页" : "Pagination"}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <CaretLeft size={15} /> {lang === "zh" ? "上一页" : "Previous"}
          </button>
          <span>{page.toLocaleString()} / {totalPages.toLocaleString()}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            {lang === "zh" ? "下一页" : "Next"} <CaretRight size={15} />
          </button>
        </nav>
      )}

      <div
        className="mt-7 rounded-xl px-4 py-3.5 flex gap-2.5"
        style={{ background: "var(--surface-subtle)", border: "1px solid var(--border-c)" }}
        data-reveal
      >
        <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--muted-c)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-c)" }}>
          {lang === "zh" ? "此目录仅展示已索引的会议记录。每篇论文保留来源链接；会议摘要属于初步研究记录，并不等同于同行评审结论。" : "This catalog shows only indexed conference records. Each paper keeps its source link; conference abstracts are preliminary records, not peer-reviewed findings."}
        </p>
      </div>
    </div>
  );
}

function authorLine(authors: CorpusPaper["authors"]) {
  return authors.map((author) => typeof author.name === "string" ? author.name : "").filter(Boolean).join(", ");
}

function PaperCard({ paper, index, lang }: { paper: CorpusPaper; index: number; lang: "en" | "zh" }) {
  return (
    <article className="library-paper-card">
      <span className="library-paper-index">{String(index).padStart(2, "0")}</span>
      <div className="library-paper-body">
        <div className="library-paper-topline">
          <span>{paper.conferenceName} {paper.conferenceYear}</span>
          {paper.division && <span>{paper.division}</span>}
        </div>
        <h2>{paper.title}</h2>
        {authorLine(paper.authors) && <p className="library-authors">{authorLine(paper.authors)}</p>}
        <p className="library-abstract">{paper.abstract}</p>
        <div className="library-paper-footer">
          <div className="library-keywords">
            {paper.keywords.slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}
          </div>
          {paper.sourceUrl && (
            <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer">
              {lang === "zh" ? "查看来源" : "View source"} <ArrowSquareOut size={14} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
