import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import AnalysisComposer from "../components/AnalysisComposer";
import { analysisAccessFor } from "../lib/analysis-policy";

const EXAMPLE_IDEA = `I'm interested in how algorithmic content curation on social media platforms affects political belief formation and polarization. Specifically, I want to understand whether exposure to algorithmically selected political content creates distinct framing effects compared with user-selected content, and whether these effects differ by prior political knowledge.`;

const CORPUS_STATS = [
  { label: "Total papers", value: "8,906" },
  { label: "APSA 2026", value: "5,493" },
  { label: "ICA 2026", value: "3,413" },
  { label: "Vector coverage", value: "100%" },
];

export default function NewAnalysis() {
  const { lang, user, setPendingIdea, setShowPaywall, analysisOptions, setAnalysisOptions } = useApp();
  const [idea, setIdea] = useState("");
  const [corpusVisible, setCorpusVisible] = useState(false);
  const corpusRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  const charCount = idea.length;
  const tooShort = charCount > 0 && charCount < 20;
  const tooLong = charCount > 5000;
  const isPro = user?.plan === "pro";
  const access = analysisAccessFor(user);
  const superSelected = analysisOptions.model === "super_apodex";
  const superAvailable = isPro && (user?.superRemaining ?? 0) > 0;
  const canSubmit = charCount >= 20 && !tooLong
      && (!superSelected || (superAvailable && analysisOptions.externalProcessingConsent))
      && analysisOptions.attachments.every((attachment) => attachment.status !== "error");

  useEffect(() => {
    setAnalysisOptions((current) => ({
      ...current,
      matchCount: access.matchCounts.includes(current.matchCount) ? current.matchCount : access.defaultMatchCount,
      model: !isPro && current.model === "super_apodex" ? "default" : current.model,
      externalProcessingConsent: !isPro ? false : current.externalProcessingConsent,
    }));
  }, [access.defaultMatchCount, access.tier, isPro, setAnalysisOptions]);

  useEffect(() => {
    const section = corpusRef.current;
    if (!section || !("IntersectionObserver" in window)) {
      setCorpusVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setCorpusVisible(true);
        observer.disconnect();
      },
      { threshold: 0.18 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (superSelected && !isPro) {
      setShowPaywall(true);
      return;
    }
    if (superSelected && !superAvailable) {
      setShowPaywall(true);
      return;
    }
    if (user?.plan === "free" && user.analysesRemainingToday <= 0) {
      setPendingIdea(idea);
      setShowPaywall(true);
      return;
    }
    setPendingIdea(idea);
    setAnalysisOptions((current) => ({ ...current, clientRequestId: crypto.randomUUID() }));
    navigate("/analysis/progress");
  }

  return (
    <div className="analysis-page">
      <div className="ambient-shape ambient-shape-blue" aria-hidden="true" />
      <div className="ambient-shape ambient-shape-yellow" aria-hidden="true" />
      <div className="ambient-shape ambient-shape-red" aria-hidden="true" />

      <section className="analysis-hero" aria-labelledby="analysis-title">
        <div className="hero-copy">
          <div className="corpus-kicker anim-fade-up">
            <span className="live-dot" />
            <span className="font-mono tabnum">8,906 papers indexed</span>
            <span className="kicker-divider" />
            <span>APSA 2026 · ICA 2026</span>
          </div>

          <h1 id="analysis-title" className="hero-title anim-fade-up d100">
            {lang === "en" ? (
              <>
                <span className="hero-lead-line">Find the <span className="hero-accent">evidence gap</span></span>
                <span className="hero-final-line">inside your idea.</span>
              </>
            ) : (
              <>找到你的研究想法中<br /><span>真正的证据缺口。</span></>
            )}
          </h1>

          <p className="hero-subtitle anim-fade-up d200">
            {lang === "en"
              ? "Compare your question with 8,906 conference papers, then turn the closest evidence into a defensible next step."
              : "将研究问题与 8,906 篇最新会议论文进行比对，再把最接近的证据转化为站得住的研究方向。"}
          </p>
        </div>

        <aside className="evidence-radar anim-fade-up d200" aria-label="Live evidence network">
          <div className="radar-orbit radar-orbit-outer" />
          <div className="radar-orbit radar-orbit-inner" />
          <div className="radar-sweep" />
          <span className="radar-node node-one" />
          <span className="radar-node node-two" />
          <span className="radar-node node-three" />
          <div className="radar-center">
            <strong className="font-mono tabnum">8,906</strong>
            <span>live abstracts</span>
          </div>
          <div className="radar-caption">
            <span className="live-dot" /> Corpus ready
          </div>
        </aside>
      </section>

      <section className="analysis-workbench anim-fade-up d300" aria-label="Research idea workbench">
        <AnalysisComposer
          lang={lang}
          user={user}
          idea={idea}
          options={analysisOptions}
          setOptions={setAnalysisOptions}
          canSubmit={canSubmit}
          tooShort={tooShort}
          tooLong={tooLong}
          onIdeaChange={setIdea}
          onExample={() => setIdea(EXAMPLE_IDEA)}
          onSubmit={handleSubmit}
          onUpgrade={() => setShowPaywall(true)}
        />

        <div className="scope-note">
          <Info size={13} />
          <p>{t("new_analysis_scope_notice", lang)}</p>
        </div>
      </section>

      <section
        ref={corpusRef}
        className={`corpus-overview${corpusVisible ? " is-visible" : ""}`}
        aria-labelledby="corpus-title"
      >
        <div className="section-heading">
          <h2 id="corpus-title">Indexed evidence</h2>
          <p>Live coverage across two 2026 social-science conferences.</p>
        </div>

        <div className="corpus-grid">
          {CORPUS_STATS.map((stat, index) => (
            <article key={stat.label} className={`corpus-stat stat-${index + 1}`}>
              <p className="stat-value font-mono tabnum">{stat.value}</p>
              <p className="stat-label">{stat.label}</p>
            </article>
          ))}
        </div>

        <div className="corpus-method">
          <div className="method-icon"><Info size={14} /></div>
          <p>{t("corpus_detail", lang)}</p>
          <span className="method-status"><i /> Production index</span>
        </div>
      </section>
    </div>
  );
}
