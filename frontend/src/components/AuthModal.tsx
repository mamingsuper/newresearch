import { useRef, useState } from "react";
import { X, EnvelopeSimple, CheckCircle, Warning } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { auth } from "../adapters/auth";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props { onClose: () => void; }
type Stage = "idle" | "sending" | "sent" | "google_loading" | "error";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export function AuthModal({ onClose }: Props) {
  const { lang } = useApp();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>({
    initialFocusRef: emailRef,
    lockBodyScroll: true,
    onEscape: onClose,
  });

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setErrorMsg(t("auth_invalid_email", lang));
      setStage("error");
      return;
    }
    setStage("sending");
    const res = await auth.signInWithEmail(email);
    if (res.ok) setStage("sent");
    else { setErrorMsg(t("auth_error", lang)); setStage("error"); }
  }

  async function handleGoogle() {
    setStage("google_loading");
    const res = await auth.signInWithGoogle();
    if (!res.ok) { setErrorMsg(t("auth_google_unavailable", lang)); setStage("error"); }
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
        role="dialog" aria-modal="true" aria-label={t("auth_title", lang)}
        tabIndex={-1}
      >
        <button
          onClick={onClose}
          className="modal-close absolute top-4 right-4 p-1.5 rounded-[8px] cursor-pointer"
          aria-label={t("close", lang)}
        >
          <X size={17} />
        </button>

        {/* Brand mark */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="brand-mark modal-brand-mark">
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
              <circle cx="14" cy="14" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.6"/>
              <circle cx="14" cy="14" r="1.8" fill="currentColor"/>
              <line x1="14" y1="14" x2="22" y2="8" stroke="currentColor" strokeWidth="1.2" opacity="0.7" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-sm">Idea Radar</span>
        </div>

        {stage === "sent" ? (
          <div className="text-center py-4">
            <CheckCircle size={38} weight="duotone" style={{ color: "var(--success-c)", margin: "0 auto 12px" }} />
            <h2 className="font-semibold text-base mb-2">{t("auth_sent_title", lang)}</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted-c)" }}>
              {t("auth_sent_body", lang)} <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-serif font-medium text-lg mb-1">{t("auth_title", lang)}</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--muted-c)" }}>{t("auth_subtitle", lang)}</p>

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={stage === "google_loading" || stage === "sending"}
              className="surface-action surface-action-raised flex items-center justify-center gap-2.5 w-full py-2.5 rounded-[10px] text-sm font-semibold border cursor-pointer mb-4 disabled:opacity-50"
            >
              <GoogleIcon />
              {stage === "google_loading" ? t("loading", lang) : t("auth_google", lang)}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <hr className="flex-1" style={{ borderColor: "var(--border-c)" }} />
              <span className="text-xs" style={{ color: "var(--muted-c)" }}>or</span>
              <hr className="flex-1" style={{ borderColor: "var(--border-c)" }} />
            </div>

            <form onSubmit={handleMagicLink}>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="auth-email" style={{ color: "var(--muted-c)" }}>
                {t("auth_email_label", lang)}
              </label>
              <input
                id="auth-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (stage === "error") setStage("idle"); }}
                placeholder={t("auth_email_placeholder", lang)}
                className="field mb-2.5"
                style={{ borderColor: stage === "error" ? "var(--danger-c)" : "var(--border-c)" }}
                autoComplete="email"
                required
                aria-invalid={stage === "error"}
                aria-describedby={stage === "error" ? "auth-email-error" : undefined}
              />
              {stage === "error" && (
                <div id="auth-email-error" className="flex items-center gap-1.5 text-xs mb-3" role="alert" style={{ color: "var(--danger-c)" }}>
                  <Warning size={12}/>{errorMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={stage === "sending"}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
                style={{ background: "var(--accent-c)" }}
              >
                <EnvelopeSimple size={14}/>
                {stage === "sending" ? t("auth_sending", lang) : t("auth_magic_link", lang)}
              </button>
            </form>

            <p className="text-xs mt-4 text-center" style={{ color: "var(--muted-c)", opacity: 0.8 }}>
              {t("auth_privacy", lang)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
