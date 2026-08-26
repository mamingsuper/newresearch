import { useState } from "react";
import { UploadSimple, CheckCircle, Info, Warning, FilePdf, SignIn } from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { programs } from "../adapters/programs";

type Stage = "form" | "submitting" | "success" | "error";

export default function SubmitProgram() {
  const { lang, user, setShowAuth } = useApp();
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    conferenceName: "", acronym: "", year: new Date().getFullYear().toString(),
    discipline: "", officialUrl: "", programUrl: "", notes: "", attested: false,
  });

  function upd(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const ok = form.conferenceName && form.acronym && form.year && form.discipline && form.officialUrl
    && (user ? (form.programUrl || file) : form.programUrl) && form.attested;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setStage("submitting");
    const res = await programs.submit({
      conferenceName: form.conferenceName, acronym: form.acronym,
      year: parseInt(form.year), discipline: form.discipline, officialUrl: form.officialUrl,
      programUrl: form.programUrl || undefined, file: file || undefined,
      notes: form.notes || undefined, attested: form.attested,
    });
    if (res.ok) setStage("success");
    else { setError(t("error_generic", lang)); setStage("error"); }
  }

  if (stage === "success") {
    return (
      <div className="product-page product-page-narrow py-16 text-center anim-fade-up" data-reveal>
        <CheckCircle size={44} weight="duotone" style={{ color: "var(--success-c)", margin: "0 auto 14px" }} />
        <h2 className="font-serif font-medium text-xl mb-2">{t("submit_success_title", lang)}</h2>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--muted-c)" }}>{t("submit_success_body", lang)}</p>
        <div className="rounded-xl px-4 py-3.5 text-left flex gap-2.5" style={{ background: "var(--surface-subtle)" }}>
          <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--muted-c)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-c)" }}>{t("submit_review_notice", lang)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-page anim-fade-up">
      <div className="submit-heading" data-reveal>
        <h1 className="font-semibold tracking-tight text-2xl" style={{ color: "var(--ink)" }}>
          {t("submit_title", lang)}
        </h1>
        <p className="text-sm" style={{ color: "var(--muted-c)" }}>{t("submit_subtitle", lang)}</p>
      </div>

      {/* Review notice */}
      <div
        className="submit-notice"
        data-reveal
      >
        <Info size={14} className="flex-shrink-0" />
        <p className="text-xs leading-relaxed">
          {t("submit_review_notice", lang)}
        </p>
      </div>

      <form onSubmit={submit} className="submit-form" data-reveal>
        <div className="submit-form-grid">
          <F id="conference-name" label={t("submit_name", lang)} req>
            <input id="conference-name" value={form.conferenceName} onChange={e => upd("conferenceName", e.target.value)} className="field" placeholder="American Political Science Association" required />
          </F>
          <F id="conference-acronym" label={t("submit_acronym", lang)} req>
            <input id="conference-acronym" value={form.acronym} onChange={e => upd("acronym", e.target.value)} className="field" placeholder="APSA" required />
          </F>
          <F id="conference-year" label={t("submit_year", lang)} req>
            <input id="conference-year" type="number" value={form.year} onChange={e => upd("year", e.target.value)} className="field" min="2000" max="2035" required />
          </F>
          <F id="conference-discipline" label={t("submit_discipline", lang)} req>
            <input id="conference-discipline" value={form.discipline} onChange={e => upd("discipline", e.target.value)} className="field" placeholder="Political Science" required />
          </F>
        </div>

        <div className="submit-form-grid submit-url-grid">
          <F id="conference-url" label={t("submit_official_url", lang)} req>
            <input id="conference-url" type="url" value={form.officialUrl} onChange={e => upd("officialUrl", e.target.value)} className="field" placeholder="https://www.apsanet.org/" required />
          </F>
          <F id="program-url" label={t("submit_program_url", lang)}>
            <input id="program-url" type="url" value={form.programUrl} onChange={e => upd("programUrl", e.target.value)} className="field" placeholder="https://conference.example.com/program" />
          </F>
        </div>

        <div className="submit-support-grid">
          {/* File upload */}
          <div className="submit-field-group">
            <p className="submit-field-label">{t("submit_file", lang)}</p>
            {user ? (
              <label className={`compact-upload${file ? " has-file" : ""}`}>
                <input type="file" accept=".pdf,.csv,.json,.zip" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                {file ? <FilePdf size={18} /> : <UploadSimple size={18} />}
                <span>{file ? file.name : t("submit_file_hint", lang)}</span>
              </label>
            ) : (
              <button type="button" className="compact-upload submit-file-auth" onClick={() => setShowAuth(true)}>
                <SignIn size={18} />
                <span>{lang === "en" ? "Sign in to upload a file" : "登录后可上传文件"}</span>
              </button>
            )}
          </div>

          <F id="submission-notes" label={t("submit_notes", lang)}>
            <textarea id="submission-notes" value={form.notes} onChange={e => upd("notes", e.target.value)} className="field resize-none" rows={2} />
          </F>
        </div>

        <div className="submit-action-row">
          {/* Attestation */}
          <label className="submit-attestation">
            <input type="checkbox" checked={form.attested} onChange={e => upd("attested", e.target.checked)} />
            <span>{t("submit_attestation", lang)}</span>
          </label>

          <button
            type="submit"
            disabled={!ok || stage === "submitting"}
            className="submit-cta"
          >
            <UploadSimple size={15}/>
            {stage === "submitting" ? t("loading", lang) : t("submit_cta", lang)}
          </button>
        </div>

        {stage === "error" && (
          <div className="flex items-center gap-2 p-3 rounded-[10px]" style={{ background: "var(--danger-dim)", color: "var(--danger-c)" }}>
            <Warning size={13}/><span className="text-sm">{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}

function F({ id, label, children, req }: { id: string; label: string; children: React.ReactNode; req?: boolean }) {
  return (
    <div className="submit-field-group">
      <label htmlFor={id} className="submit-field-label">
        {label}{req && <span style={{ color: "var(--danger-c)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
