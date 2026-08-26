import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, ChatTeardropText, Pencil, Export, Trash, ArrowRight, Warning, SignIn } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { sessions } from "../adapters/sessions";
import type { ConversationSummary } from "../types";

export default function Conversations() {
  const { lang, user, setShowAuth, setCurrentReport, refreshUser } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    sessions.list()
      .then(setItems)
      .catch(() => setError(lang === "en" ? "Analysis history could not be loaded." : "历史会话暂时无法加载。"))
      .finally(() => setLoading(false));
  }, [lang, user]);

  const filtered = items.filter(x => {
    const q = search.toLowerCase();
    return !q || x.title.toLowerCase().includes(q) || x.ideaSnippet.toLowerCase().includes(q);
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await sessions.delete(deleteTarget);
    if (result.ok) {
      setItems(prev => prev.filter(x => x.id !== deleteTarget));
      void refreshUser();
    } else setError(result.error);
    setDeleteTarget(null);
    setDeleting(false);
  }

  async function reopen(id: string) {
    try {
      setCurrentReport(await sessions.reopen(id));
      navigate("/analysis/results");
    } catch {
      setError(lang === "en" ? "This analysis could not be reopened." : "无法重新打开该分析。" );
    }
  }

  async function rename(item: ConversationSummary) {
    const title = window.prompt(lang === "en" ? "Rename analysis" : "重命名分析", item.title);
    if (!title || title === item.title) return;
    const result = await sessions.rename(item.id, title);
    if (result.ok) setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, title: title.trim() } : candidate));
    else setError(result.error);
  }

  function exportSession(item: ConversationSummary) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `idea-radar-${item.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="product-page anim-fade-up">

      {/* Header */}
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="font-semibold tracking-tight text-2xl" style={{ color: "var(--ink)" }}>
          {t("conversations_title", lang)}
        </h1>
        <span className="font-mono text-xs tabnum badge" style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}>
          {user ? items.length : 0}
        </span>
      </div>

      {!user ? (
        <div className="workspace-auth-state">
          <div className="workspace-auth-art" aria-hidden="true">
            <span className="bauhaus-circle" />
            <span className="bauhaus-square" />
            <ChatTeardropText size={28} weight="fill" />
          </div>
          <div>
            <h2>{t("workspace_signin_title", lang)}</h2>
            <p>{t("workspace_signin_conversations", lang)}</p>
            <p className="sr-only">Sign in to see your analysis history and conversations here.</p>
          </div>
          <button type="button" onClick={() => setShowAuth(true)} className="workspace-auth-cta">
            <SignIn size={16} /> {t("workspace_signin_cta", lang)}
          </button>
        </div>
      ) : <>
      {/* Search */}
      <div
        className="flex items-center gap-2 mb-5 px-3 py-2 rounded-[10px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border-c)" }}
      >
        <MagnifyingGlass size={14} style={{ color: "var(--muted-c)" }} />
        <input
          type="search"
          aria-label={t("conversations_search", lang)}
          placeholder={t("conversations_search", lang)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: "var(--ink)" }}
        />
      </div>

      {/* List */}
      {error ? (
        <div className="card p-4 text-sm" role="alert" style={{ color: "var(--danger-c)" }}>{error}</div>
      ) : loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <Empty />
      ) : filtered.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              className="group card p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Meta */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="badge"
                      style={{
                        background: item.lang === "zh" ? "var(--signal-dim)" : "var(--surface-subtle)",
                        color: item.lang === "zh" ? "var(--signal-c)" : "var(--muted-c)",
                      }}
                    >
                      {item.lang === "zh" ? "ZH" : "EN"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-c)" }}>{fmt(item.createdAt)}</span>
                    <span className="font-mono text-xs tabnum" style={{ color: "var(--muted-c)" }}>
                      · {item.paperCount} papers
                    </span>
                  </div>
                  <h3 className="font-serif font-medium text-sm mb-1 leading-snug">{item.title}</h3>
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--muted-c)" }}>
                    {item.ideaSnippet}
                  </p>
                </div>

                {/* Actions */}
                <div className="conversation-actions flex items-center gap-1 flex-shrink-0 mt-0.5">
                  <button onClick={() => void rename(item)} className="p-1.5 rounded-[7px] cursor-pointer transition-colors" style={{ color: "var(--muted-c)" }} aria-label={t("conversations_rename", lang)}>
                    <Pencil size={13}/>
                  </button>
                  <button onClick={() => exportSession(item)} className="p-1.5 rounded-[7px] cursor-pointer transition-colors" style={{ color: "var(--muted-c)" }} aria-label={t("conversations_export", lang)}>
                    <Export size={13}/>
                  </button>
                  <button onClick={() => setDeleteTarget(item.id)} className="p-1.5 rounded-[7px] cursor-pointer" style={{ color: "var(--danger-c)" }} aria-label={t("conversations_delete", lang)}>
                    <Trash size={13}/>
                  </button>
                  <button onClick={() => void reopen(item.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer ml-1"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-c)" }}>
                    {t("conversations_reopen", lang)} <ArrowRight size={10}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 anim-scale-in"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-modal)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <Warning size={17} style={{ color: "var(--danger-c)" }} />
              <h3 className="font-semibold text-sm">{t("conversations_delete_confirm", lang)}</h3>
            </div>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--muted-c)" }}>
              {t("conversations_delete_body", lang)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer"
                style={{ background: "var(--surface-subtle)", color: "var(--muted-c)" }}
              >
                {t("conversations_cancel", lang)}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
                style={{ background: "var(--danger-c)" }}
              >
                {deleting ? t("loading", lang) : t("conversations_delete_action", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="h-2.5 w-36 rounded mb-2.5" style={{ background: "var(--surface-subtle)" }} />
          <div className="h-4 w-2/3 rounded" style={{ background: "var(--surface-subtle)" }} />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  const { lang } = useApp();
  return (
    <div className="empty-state" style={{ color: "var(--muted-c)" }}>
      <div className="empty-state-icon"><ChatTeardropText size={30} /></div>
      <p className="text-sm">{t("conversations_empty", lang)}</p>
    </div>
  );
}
