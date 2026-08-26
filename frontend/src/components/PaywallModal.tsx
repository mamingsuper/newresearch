import { useState } from "react";
import { X, Lightning, ArrowClockwise, Warning } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { billing } from "../adapters/billing";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props { onClose: () => void; }

export function PaywallModal({ onClose }: Props) {
  const { lang, user } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const dialogRef = useFocusTrap<HTMLDivElement>({ lockBodyScroll: true, onEscape: onClose });

  const isPro = user?.plan === "pro";

  const resetTime = new Date();
  resetTime.setUTCHours(24, 0, 0, 0);

  async function handleUpgrade() {
    setLoading(true); setError("");
    const res = await billing.createCheckout(user ? undefined : email);
    setLoading(false);
    if (!res.ok) setError(t("pricing_checkout_unavailable", lang));
  }

  async function handlePortal() {
    setLoading(true);
    const res = await billing.openPortal();
    setLoading(false);
    if (!res.ok) setError(t("pricing_checkout_unavailable", lang));
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="premium-modal w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-7 relative anim-scale-in"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={t("pricing_title", lang)}
        tabIndex={-1}
      >
        <button onClick={onClose} className="modal-close absolute top-4 right-4 p-1.5 rounded-[8px] cursor-pointer"
          aria-label={t("close", lang)}
        ><X size={17}/></button>

        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-5"
          style={{ background: "var(--signal-dim)" }}
        >
          <Lightning size={18} weight="duotone" style={{ color: "var(--signal-c)" }} />
        </div>

        <h2 className="font-serif font-medium text-lg mb-1">{t("pricing_title", lang)}</h2>
        <p className="text-sm mb-1.5" style={{ color: "var(--muted-c)" }}>{t("pricing_body", lang)}</p>
        <p className="text-xs mb-5 font-mono tabnum" style={{ color: "var(--muted-c)", opacity: 0.7 }}>
          {t("pricing_resets", lang)}: {resetTime.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
        </p>

        {/* Pro card */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{ background: "var(--accent-dim)", border: "1px solid color-mix(in srgb, var(--accent-c) 25%, transparent)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Lightning size={13} weight="duotone" style={{ color: "var(--accent-c)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--accent-c)" }}>Pro</span>
            </div>
            <span className="font-mono text-sm tabnum font-medium" style={{ color: "var(--accent-c)" }}>
              {t("pricing_pro_price", lang)}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--accent-c)", opacity: 0.7 }}>
            {t("pricing_pro_feature", lang)}
          </p>
          <p className="text-xs mt-1.5" style={{ color: "var(--accent-c)", opacity: 0.82 }}>
            SUPER:Apodex deep research · 5 complete cited memos per month
          </p>
        </div>

        {error && (
          <div
            className="flex items-center gap-1.5 text-xs mb-3 p-3 rounded-[10px]"
            role="alert"
            style={{ background: "var(--danger-dim)", color: "var(--danger-c)" }}
          >
            <Warning size={12}/>{error}
          </div>
        )}

        {!user && !isPro && (
          <label className="paywall-email">
            <span>{lang === "zh" ? "结账邮箱" : "Checkout email"}</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="researcher@example.org"
              required
            />
            <small>{lang === "zh" ? "无需先登录。付款后用同一邮箱登录，即可自动认领 Pro。" : "No login required. Sign in later with the same email to claim Pro automatically."}</small>
          </label>
        )}

        {isPro ? (
          <button
            onClick={handlePortal}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60 mb-2"
            style={{ background: "var(--accent-c)" }}
          >
            <ArrowClockwise size={14} className={loading ? "anim-spin" : ""}/>
            {t("pricing_manage", lang)}
          </button>
        ) : (
          <>
            <button
              onClick={handleUpgrade}
              disabled={loading || (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60 mb-2"
              style={{ background: "var(--accent-c)" }}
            >
              <Lightning size={14} weight="duotone"/>
              {loading ? t("pricing_checkout_loading", lang) : t("pricing_upgrade", lang)}
            </button>
            <button
              onClick={onClose}
              className="surface-action w-full py-2.5 text-sm cursor-pointer rounded-[10px]"
            >
              {t("pricing_not_now", lang)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
