import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { analysis } from "../adapters/analysis";

const STEPS = [
  "progress_step1", "progress_step2", "progress_step3", "progress_step4",
  "progress_step5", "progress_step6", "progress_step7", "progress_step8",
] as const;

export default function AnalysisProgress() {
  const { lang, pendingIdea, analysisOptions, setCurrentReport, refreshUser } = useApp();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pendingIdea) { navigate("/"); return; }
    analysis.run(pendingIdea, analysisOptions, (step, p) => {
      setActiveStep(step);
      setPct(p);
    }).then(report => {
      setCurrentReport(report);
      setDone(true);
      void refreshUser();
      setTimeout(() => navigate("/analysis/results"), 700);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Analysis could not be completed.");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[480px] anim-fade-up">

        {error && (
          <div className="card p-5 mb-6" role="alert" style={{ borderColor: "var(--danger-c)", background: "var(--danger-dim)" }}>
            <div className="flex gap-2.5 items-start mb-4" style={{ color: "var(--danger-c)" }}>
              <Warning size={18} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
            <button onClick={() => navigate("/")} className="primary-cta">
              {lang === "en" ? "Review settings" : "返回检查设置"}
            </button>
          </div>
        )}

        {/* Idea snippet */}
        <div className="rounded-xl px-4 py-3.5 mb-8" style={{ background: "var(--surface)", border: "1px solid var(--border-c)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted-c)", letterSpacing: "0.1em" }}>
            Analyzing
          </p>
          <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--ink)", opacity: 0.8 }}>
            {pendingIdea?.slice(0, 200)}{(pendingIdea?.length ?? 0) > 200 ? "…" : ""}
          </p>
        </div>

        {/* Progress bar */}
        {!error && <div className="relative h-1.5 rounded-full overflow-hidden mb-6" style={{ background: "var(--surface-subtle)" }}>
          <div
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-700"
            style={{ transform: `scaleX(${pct / 100})`, background: "var(--accent-c)" }}
          />
        </div>}

        {/* Step list */}
        {!error && <div className="space-y-0.5">
          {STEPS.map((key, i) => {
            const n = i + 1;
            const isDone = n < activeStep || done;
            const isActive = n === activeStep && !done;
            const isPending = n > activeStep && !done;

            return (
              <div
                key={key}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] transition-colors"
                style={{
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  opacity: isPending && n > activeStep + 1 ? 0.3 : 1,
                }}
              >
                {/* Icon */}
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {isDone ? (
                    <CheckCircle size={16} weight="duotone" style={{ color: "var(--success-c)" }} />
                  ) : isActive ? (
                    <span
                      className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent anim-spin block"
                      style={{ borderColor: "var(--accent-c)", borderTopColor: "transparent" }}
                    />
                  ) : (
                    <span
                      className="w-3 h-3 rounded-full border"
                      style={{ borderColor: "var(--border-c)" }}
                    />
                  )}
                </span>

                <span
                  className="flex-1 text-sm"
                  style={{
                    color: isActive ? "var(--accent-c)" : isDone ? "var(--ink)" : "var(--muted-c)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {t(key, lang)}
                </span>

                <span className="font-mono text-xs" style={{ color: "var(--muted-c)", opacity: 0.5 }}>
                  {isActive ? `${pct}%` : isDone ? "✓" : ""}
                </span>
              </div>
            );
          })}
        </div>}

        {!error && <p className="font-mono text-xs text-center mt-6 tabnum" style={{ color: "var(--muted-c)", opacity: 0.6 }}>
          Corpus: 8,906 papers · APSA 2026 · ICA 2026
        </p>}
      </div>
    </div>
  );
}
