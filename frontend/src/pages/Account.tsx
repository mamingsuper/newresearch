import { useState } from "react";
import {
  User, CreditCard, ChartBar, BookmarkSimple,
  ChatTeardropText, Download, SignOut, SignIn, Warning, CheckCircle, Lightning
} from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { account as accountAdapter } from "../adapters/account";
import { billing } from "../adapters/billing";
import { auth } from "../adapters/auth";

export default function Account() {
  const { lang, user, setShowAuth } = useApp();

  const [showDelete, setShowDelete] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const CONFIRM = t("account_delete_confirm_phrase", lang);
  const canDelete = phrase === CONFIRM;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    const result = await accountAdapter.deleteAccount();
    if (result.ok) setDeleted(true);
    else setError(result.error);
    setDeleting(false);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await accountAdapter.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "idea-radar-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(lang === "en" ? "Your account export could not be created." : "暂时无法创建账户数据导出。");
    }
    setDownloading(false);
  }

  async function handleBilling() {
    if (!user) return;
    setBillingLoading(true);
    if (user.plan === "pro") await billing.openPortal();
    else await billing.createCheckout();
    setBillingLoading(false);
  }

  if (!user) return (
    <div className="product-page product-page-narrow anim-fade-up">
      <div className="workspace-auth-state">
        <div className="workspace-auth-art"><User size={28} weight="fill" /></div>
        <div>
          <h2>{lang === "en" ? "Your private research account" : "您的私人研究账户"}</h2>
          <p>{lang === "en" ? "Sign in to manage your plan, exports, saved work, and account deletion." : "登录后可管理会员、数据导出、收藏、历史和账户删除。"}</p>
        </div>
        <button type="button" className="workspace-auth-cta" onClick={() => setShowAuth(true)}><SignIn size={16} /> {lang === "en" ? "Sign in" : "登录"}</button>
      </div>
    </div>
  );

  if (deleted) return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center anim-fade-up">
      <CheckCircle size={44} weight="duotone" style={{ color: "var(--success-c)", margin: "0 auto 14px" }} />
      <h2 className="font-serif font-medium text-xl mb-2">Account deleted</h2>
      <p className="text-sm" style={{ color: "var(--muted-c)" }}>All your data has been removed permanently.</p>
    </div>
  );

  return (
    <div className="product-page product-page-narrow anim-fade-up">
      <h1 className="font-semibold tracking-tight text-2xl mb-6" style={{ color: "var(--ink)" }}>
        {t("account_title", lang)}
      </h1>

      {error && <div className="card p-4 mb-4 text-sm" role="alert" style={{ color: "var(--danger-c)" }}>{error}</div>}

      {/* Identity */}
      <Card>
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--accent-dim)" }}
          >
            <User size={18} style={{ color: "var(--accent-c)" }} />
          </div>
          <div>
            <p className="font-semibold text-sm">{user.email}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-c)" }}>{t("account_email", lang)}</p>
          </div>
          <div className="ml-auto">
            <span
              className="badge"
              style={{
                background: user.plan === "pro" ? "var(--accent-dim)" : "var(--surface-subtle)",
                color: user.plan === "pro" ? "var(--accent-c)" : "var(--muted-c)",
                padding: "3px 10px",
              }}
            >
              {user.plan === "pro" ? t("account_pro_plan", lang) : t("account_free_plan", lang)}
            </span>
          </div>
        </div>
      </Card>

      {/* Plan & usage */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard size={15} style={{ color: "var(--muted-c)" }} />
            <span className="font-semibold text-sm">{t("account_plan", lang)}</span>
          </div>
          <button
            onClick={handleBilling}
            disabled={billingLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[9px] cursor-pointer disabled:opacity-50"
            style={{ color: "var(--accent-c)", background: "var(--accent-dim)" }}
          >
            <Lightning size={12} weight="duotone"/>
            {billingLoading ? t("loading", lang) : user.plan === "pro" ? t("account_manage_sub", lang) : "Upgrade to Pro"}
          </button>
        </div>
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl"
          style={{ background: "var(--surface-subtle)" }}
        >
          <Stat
            icon={<ChartBar size={13}/>}
            label={t("account_analyses_remaining", lang)}
            value={user.plan === "pro" ? "∞" : String(user.analysesRemainingToday)}
            accent={user.plan === "pro"}
          />
          <Stat
            icon={<BookmarkSimple size={13}/>}
            label={t("account_saved_papers", lang)}
            value={String(user.savedPapersCount)}
          />
          <Stat
            icon={<ChatTeardropText size={13}/>}
            label={t("account_conversations", lang)}
            value={String(user.conversationsCount)}
          />
          <Stat
            icon={<Lightning size={13}/>}
            label="SUPER:Apodex"
            value={user.plan === "pro" ? `${user.superRemaining}/${user.superMonthlyLimit}` : "—"}
            accent={user.plan === "pro"}
          />
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Download size={14} style={{ color: "var(--muted-c)" }} />
          <span className="font-semibold text-sm">Data &amp; Session</span>
        </div>
        <div className="space-y-0.5">
          <ActionRow icon={<Download size={14}/>} label={downloading ? t("loading", lang) : t("account_download", lang)} onClick={handleDownload} disabled={downloading} />
          <ActionRow icon={<SignOut size={14}/>} label={t("account_sign_out", lang)} onClick={() => void auth.signOut()} />
        </div>
      </Card>

      {/* Danger zone */}
      <div
        className="rounded-2xl p-5"
        style={{ border: "1px solid var(--danger-c)", background: "var(--danger-dim)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Warning size={15} style={{ color: "var(--danger-c)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--danger-c)" }}>
              {t("account_delete", lang)}
            </span>
          </div>
          {!showDelete && (
            <button
              onClick={() => setShowDelete(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-[9px] cursor-pointer"
              style={{ color: "var(--danger-c)", background: "rgba(179,38,30,0.12)" }}
            >
              {t("account_delete", lang)}
            </button>
          )}
        </div>
        <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--danger-c)", opacity: 0.8 }}>
          {t("account_delete_warning", lang)}
        </p>

        {showDelete && (
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--danger-c)" }}>
              {t("account_delete_confirm_label", lang)}
            </p>
            <input
              type="text"
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border mb-3 outline-none"
              style={{
                borderColor: "var(--danger-c)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontFamily: "'DM Mono', monospace",
              }}
              placeholder={CONFIRM}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setPhrase(""); }}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer"
                style={{ background: "var(--surface)", color: "var(--muted-c)" }}
              >
                {t("cancel", lang)}
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-35"
                style={{ background: "var(--danger-c)" }}
              >
                {deleting ? t("loading", lang) : t("account_delete_action", lang)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-4">{children}</div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5" style={{ color: "var(--muted-c)" }}>
        {icon}
      </div>
      <p className="font-mono text-lg tabnum font-medium" style={{ color: accent ? "var(--accent-c)" : "var(--ink)" }}>
        {value}
      </p>
      <p className="text-xs leading-snug mt-0.5" style={{ color: "var(--muted-c)" }}>{label}</p>
    </div>
  );
}

function ActionRow({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[10px] text-sm transition-colors cursor-pointer disabled:opacity-50 text-left"
      style={{ color: "var(--muted-c)" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-subtle)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
    >
      {icon}
      {label}
    </button>
  );
}
