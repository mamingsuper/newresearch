import { useState, useEffect } from "react";
import { MagnifyingGlass, BookmarkSimple, ArrowSquareOut, Export, Trash, Tag, SignIn, Warning } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { papers as papersAdapter } from "../adapters/papers";
import { ContentSkeleton } from "../components/ContentSkeleton";
import { EmptyState } from "../components/EmptyState";
import type { Paper } from "../types";

type Conf = "all" | "APSA 2026" | "ICA 2026";

export default function SavedPapers() {
  const { lang, user, setShowAuth, refreshUser } = useApp();
  const [all, setAll] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [conf, setConf] = useState<Conf>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { setAll([]); setLoading(false); return; }
    setLoading(true);
    papersAdapter.list()
      .then(setAll)
      .catch(() => setError(lang === "en" ? "Saved papers could not be loaded." : "收藏论文暂时无法加载。"))
      .finally(() => setLoading(false));
  }, [lang, user]);

  async function removePaper(paper: Paper) {
    const result = await papersAdapter.remove(paper.id);
    if (!result.ok) { setError(result.error); return; }
    setAll((items) => items.filter((item) => item.id !== paper.id));
    void refreshUser();
  }

  async function exportPapers() {
    const blob = await papersAdapter.exportCsv(filtered.map((paper) => paper.id));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "idea-radar-saved-papers.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const filtered = all.filter(p => {
    const ok = conf === "all" || p.conference === conf;
    const q = search.toLowerCase();
    return ok && (!q || p.title.toLowerCase().includes(q) || p.authors.toLowerCase().includes(q) || p.abstract.toLowerCase().includes(q));
  });

  return (
    <div className="product-page anim-fade-up">

      {/* Header */}
      <div className="flex items-baseline gap-3 mb-6" data-reveal>
        <h1 className="font-semibold tracking-tight text-2xl" style={{ color: "var(--ink)" }}>
          {t("saved_papers_title", lang)}
        </h1>
        <span className="font-mono text-xs tabnum badge" style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}>
          {user ? all.length : 0}
        </span>
      </div>

      {!user ? (
        <div className="workspace-auth-state" data-reveal>
          <div className="workspace-auth-art" aria-hidden="true">
            <span className="bauhaus-circle" />
            <span className="bauhaus-square" />
            <BookmarkSimple size={28} weight="fill" />
          </div>
          <div>
            <h2>{t("workspace_signin_title", lang)}</h2>
              <p>{t("workspace_signin_saved", lang)}</p>
              <p className="sr-only">Sign in to see your saved papers and personal collection here.</p>
          </div>
          <button type="button" onClick={() => setShowAuth(true)} className="workspace-auth-cta">
            <SignIn size={16} /> {t("workspace_signin_cta", lang)}
          </button>
        </div>
      ) : <>
      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-5" data-reveal>
        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 min-w-52 px-3 py-2 rounded-[10px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border-c)" }}
        >
          <MagnifyingGlass size={14} style={{ color: "var(--muted-c)", flexShrink: 0 }} />
          <input
            type="search"
            aria-label={t("saved_papers_search", lang)}
            placeholder={t("saved_papers_search", lang)}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: "var(--ink)" }}
          />
        </div>
        {/* Conference filter */}
        {(["all", "APSA 2026", "ICA 2026"] as Conf[]).map(f => (
          <button
            key={f}
            onClick={() => setConf(f)}
            className="px-3 py-2 rounded-[9px] text-xs font-semibold cursor-pointer transition-colors"
            style={{
              background: conf === f ? "var(--accent-dim)" : "var(--surface)",
              color: conf === f ? "var(--accent-c)" : "var(--muted-c)",
              border: `1px solid ${conf === f ? "var(--accent-c)" : "var(--border-c)"}`,
            }}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
        <button
          onClick={() => void exportPapers()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-xs font-medium cursor-pointer ml-auto"
          style={{ background: "var(--surface)", color: "var(--muted-c)", border: "1px solid var(--border-c)" }}
        >
          <Export size={13} />
          {t("saved_papers_export", lang)}
        </button>
      </div>

      {/* Content */}
      {error ? (
        <EmptyState
          tone="danger"
          icon={<Warning size={28} weight="duotone" />}
          title={lang === "zh" ? "无法加载收藏论文" : "Saved papers unavailable"}
          description={error}
        />
      ) : loading ? (
        <ContentSkeleton variant="paper" label={t("loading", lang)} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<BookmarkSimple size={30} weight="duotone" />}
          title={t("saved_papers_empty", lang)}
          description={lang === "zh" ? "在分析结果中收藏的论文会集中显示在这里。" : "Papers saved from analysis results will appear here."}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={30} />}
          title={t("saved_papers_filtered_empty", lang)}
          description={lang === "zh" ? "调整关键词或会议筛选后再试。" : "Try a different keyword or conference filter."}
          action={(
            <button type="button" className="surface-action" onClick={() => { setSearch(""); setConf("all"); }}>
              {lang === "zh" ? "清除筛选" : "Clear filters"}
            </button>
          )}
        />
      ) : (
        <div className="space-y-3 stagger-list" data-reveal>
          {filtered.map(p => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start gap-3">
                <BookmarkSimple size={14} weight="fill" className="flex-shrink-0 mt-1" style={{ color: "var(--accent-c)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--accent-c)" }}>{p.authorYear}</p>
                  <h3 className="font-serif font-medium text-sm leading-snug mb-1">{p.title}</h3>
                  <p className="text-xs mb-2.5" style={{ color: "var(--muted-c)" }}>{p.authors}</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="badge" style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}>{p.conference}</span>
                    {p.division && <span className="badge" style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}>{p.division}</span>}
                  </div>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--muted-c)" }}>
                    {p.abstract.slice(0, 220)}…
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--muted-c)" }}>
                      <ArrowSquareOut size={11}/> {t("paper_source", lang)}
                    </a>
                    <button className="inline-flex items-center gap-1 text-xs cursor-pointer ml-auto" style={{ color: "var(--muted-c)" }}>
                      <Tag size={11}/> {t("saved_papers_note", lang)}
                    </button>
                    <button
                      onClick={() => void removePaper(p)}
                      className="inline-flex items-center gap-1 text-xs cursor-pointer"
                      style={{ color: "var(--danger-c)" }}
                    >
                      <Trash size={11}/> {t("saved_papers_remove", lang)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>}
    </div>
  );
}
