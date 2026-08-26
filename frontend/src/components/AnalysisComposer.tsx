import { useEffect, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import {
  ArrowLeft,
  ArrowUp,
  CaretRight,
  Check,
  FilePdf,
  FileText,
  Lightning,
  Lock,
  Sparkle,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type { AnalysisOptions } from "../types";
import type { Lang } from "../i18n";
import { analysisAccessFor, validateAnalysisAttachment } from "../lib/analysis-policy";

type ComposerUser = {
  plan: "free" | "pro";
  analysesRemainingToday: number;
  superRemaining: number;
  superMonthlyLimit: number;
} | null;

type Props = {
  lang: Lang;
  user: ComposerUser;
  idea: string;
  options: AnalysisOptions;
  setOptions: Dispatch<SetStateAction<AnalysisOptions>>;
  canSubmit: boolean;
  tooShort: boolean;
  tooLong: boolean;
  onIdeaChange: (idea: string) => void;
  onExample: () => void;
  onSubmit: (event: FormEvent) => void;
  onUpgrade: () => void;
};

type MenuPanel = "root" | "model" | "evidence" | "advanced";

const errorCopy: Record<string, { en: string; zh: string }> = {
  INVALID_NAME: { en: "Use a simple filename.", zh: "请使用普通文件名。" },
  EMPTY_FILE: { en: "This file is empty.", zh: "该文件为空。" },
  FILE_TOO_LARGE: { en: "Files must be 6 MB or smaller.", zh: "文件大小不能超过 6 MB。" },
  UNSUPPORTED_TYPE: { en: "Use PDF, Markdown, or TXT.", zh: "仅支持 PDF、Markdown 或 TXT。" },
};

export default function AnalysisComposer({
  lang,
  user,
  idea,
  options,
  setOptions,
  canSubmit,
  tooShort,
  tooLong,
  onIdeaChange,
  onExample,
  onSubmit,
  onUpgrade,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>("root");
  const [fileError, setFileError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const access = analysisAccessFor(user);
  const superSelected = options.model === "super_apodex";
  const modelLabel = superSelected ? "SUPER:Apodex" : "Idea Radar";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(112, Math.min(288, textarea.scrollHeight))}px`;
  }, [idea]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setPanel("root");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setFileError("");
    const slots = Math.max(0, access.maxAttachments - options.attachments.length);
    const candidates = Array.from(files).slice(0, slots);
    if (files.length > slots) {
      setFileError(lang === "en" ? `This plan allows ${access.maxAttachments} attachment${access.maxAttachments === 1 ? "" : "s"}.` : `当前方案最多上传 ${access.maxAttachments} 个附件。`);
    }
    const accepted = candidates.flatMap((file) => {
      const result = validateAnalysisAttachment(file);
      if (!result.ok) {
        setFileError(errorCopy[result.code][lang]);
        return [];
      }
      return [{ clientId: crypto.randomUUID(), file, status: "ready" as const }];
    });
    if (accepted.length) setOptions((current) => ({ ...current, attachments: [...current.attachments, ...accepted] }));
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseModel(model: AnalysisOptions["model"]) {
    if (model === "super_apodex" && !access.canUseSuper) {
      onUpgrade();
      return;
    }
    setOptions((current) => ({
      ...current,
      model,
      effort: model === "super_apodex" ? "high" : "standard",
      externalProcessingConsent: model === "default" ? false : current.externalProcessingConsent,
    }));
    setPanel("root");
  }

  return (
    <form onSubmit={onSubmit} className={`query-card codex-composer${focused ? " is-focused" : ""}`}>
      <div className="query-card-glow" aria-hidden="true" />
      <div className="query-toolbar">
        <div>
          <label htmlFor="research-idea" className="query-eyebrow">{lang === "en" ? "Research direction" : "研究方向"}</label>
          <p id="research-idea-help">{lang === "en" ? "Describe the question you want to pressure-test" : "描述你希望检验的研究问题"}</p>
        </div>
        <button type="button" onClick={() => { onExample(); requestAnimationFrame(() => textareaRef.current?.focus()); }} className="example-action">
          <Sparkle size={14} weight="fill" />
          {lang === "en" ? "Try an example" : "试试示例"}
        </button>
      </div>

      {options.attachments.length > 0 && (
        <div className="composer-attachments" aria-label={lang === "en" ? "Attached research files" : "研究附件"}>
          {options.attachments.map((attachment) => (
            <div className="attachment-chip" key={attachment.clientId} data-status={attachment.status}>
              {attachment.file.name.toLowerCase().endsWith(".pdf") ? <FilePdf size={17} /> : <FileText size={17} />}
              <span><strong>{attachment.file.name}</strong><small>{formatBytes(attachment.file.size)} · {attachment.status === "ready" ? (lang === "en" ? "Ready" : "待解析") : attachment.status}</small></span>
              <button type="button" aria-label={`${lang === "en" ? "Remove" : "移除"} ${attachment.file.name}`} onClick={() => setOptions((current) => ({ ...current, attachments: current.attachments.filter((item) => item.clientId !== attachment.clientId) }))}>
                <X size={13} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        id="research-idea"
        ref={textareaRef}
        value={idea}
        onChange={(event) => onIdeaChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={lang === "en" ? "Describe your research idea — question, case, mechanism, method, or uncertainty…" : "描述你的研究想法——问题、案例、机制、方法或不确定性……"}
        minLength={20}
        maxLength={5000}
        className="query-textarea"
        aria-describedby="research-idea-help"
      />

      {superSelected && (
        <label className="processing-consent">
          <input type="checkbox" checked={options.externalProcessingConsent} onChange={(event) => setOptions((current) => ({ ...current, externalProcessingConsent: event.target.checked }))} />
          <span>{lang === "en"
            ? "Send this idea, attached text, and selected public abstracts to Apodex for this research only."
            : "仅为本次研究，将该想法、附件文字与选定的公开摘要发送给 Apodex。"}</span>
        </label>
      )}

      <div className="composer-bottom-bar">
        <div className="composer-left-tools">
          <input ref={fileRef} type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain" multiple={access.maxAttachments > 1} className="sr-only" onChange={(event) => addFiles(event.target.files)} />
          <button type="button" className="composer-upload-button" onClick={() => fileRef.current?.click()} disabled={options.attachments.length >= access.maxAttachments}>
            <UploadSimple size={17} weight="bold" />
            <span>{lang === "en" ? "Upload files" : "上传文件"}</span>
          </button>
          <div className="composer-upload-meta">
            <span className="query-counter font-mono tabnum" data-state={tooLong ? "danger" : tooShort ? "warning" : "idle"}>{idea.length.toLocaleString()} / 5,000</span>
            <span>{lang === "en"
              ? `${options.attachments.length}/${access.maxAttachments} files · PDF, MD, TXT`
              : `${options.attachments.length}/${access.maxAttachments} 个文件 · PDF、MD、TXT`}</span>
          </div>
        </div>

        <div className="composer-model-wrap" ref={menuRef}>
          {menuOpen && (
            <div className="composer-model-menu" role="dialog" aria-label={lang === "en" ? "Analysis settings" : "分析设置"}>
              {panel !== "root" && (
                <button type="button" className="model-menu-back" onClick={() => setPanel("root")}><ArrowLeft size={14} /> {lang === "en" ? "Settings" : "设置"}</button>
              )}
              {panel === "root" && <>
                <MenuRow label={lang === "en" ? "Model selection" : "模型选择"} value={modelLabel} onClick={() => setPanel("model")} />
                <MenuRow label={lang === "en" ? "Evidence" : "证据范围"} value={`${options.matchCount} ${lang === "en" ? "papers" : "篇"}`} onClick={() => setPanel("evidence")} />
                <div className="model-menu-separator" />
                <MenuRow label={lang === "en" ? "Advanced" : "高级设置"} value="" onClick={() => setPanel("advanced")} />
              </>}
              {panel === "model" && <>
                <Choice label="Idea Radar" detail={lang === "en" ? "Fast, corpus-grounded analysis" : "快速、基于会议语料的分析"} selected={!superSelected} onClick={() => chooseModel("default")} />
                <Choice label="SUPER:Apodex" detail={access.canUseSuper ? `${user?.superRemaining ?? 0}/${user?.superMonthlyLimit ?? 5} ${lang === "en" ? "remaining" : "次可用"}` : (lang === "en" ? "Pro only" : "仅限 Pro")} selected={superSelected} locked={!access.canUseSuper} onClick={() => chooseModel("super_apodex")} icon={<Lightning size={15} weight="fill" />} />
              </>}
              {panel === "evidence" && access.matchCounts.map((count) => (
                <Choice key={count} label={`${count} ${lang === "en" ? "papers" : "篇论文"}`} detail={count === 5 ? (lang === "en" ? "Anonymous preview" : "匿名体验") : count === 10 ? (lang === "en" ? "Free fixed depth" : "免费版固定") : count === 20 ? (lang === "en" ? "Focused Pro review" : "Pro 精选检索") : (lang === "en" ? "Broad Pro review" : "Pro 广泛检索")} selected={options.matchCount === count} onClick={() => { setOptions((current) => ({ ...current, matchCount: count })); setPanel("root"); }} />
              ))}
              {panel === "advanced" && <div className="advanced-menu-copy">
                <strong>{lang === "en" ? "Attachment privacy" : "附件隐私"}</strong>
                <p>{lang === "en" ? "Files are parsed privately to improve corpus retrieval, never sent to the model, and removed after analysis. PDF, Markdown, and TXT only." : "文件仅在私密环境解析并用于增强语料检索，不发送给模型，分析后移除。仅支持 PDF、Markdown 与 TXT。"}</p>
              </div>}
            </div>
          )}
          <button type="button" className="composer-model-trigger" aria-expanded={menuOpen} onClick={() => { setMenuOpen((open) => !open); setPanel("root"); }}>
            <span className="composer-model-copy">
              <small>{lang === "en" ? "Model selection" : "模型选择"}</small>
              <strong>{modelLabel}</strong>
            </span>
            <CaretRight size={14} className={menuOpen ? "is-open" : ""} />
          </button>
        </div>

        <button type="submit" className="composer-send" disabled={!canSubmit} aria-label={lang === "en" ? "Analyze research idea" : "分析研究想法"}>
          <ArrowUp size={20} weight="bold" />
        </button>
      </div>

      {fileError && <p className="composer-file-error" role="alert">{fileError}</p>}
    </form>
  );
}

function MenuRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button type="button" className="model-menu-row" onClick={onClick}><span>{label}</span><span>{value}<CaretRight size={15} /></span></button>;
}

function Choice({ label, detail, selected, locked = false, onClick, icon }: { label: string; detail: string; selected: boolean; locked?: boolean; onClick: () => void; icon?: ReactNode }) {
  return <button type="button" className={`model-menu-choice${selected ? " selected" : ""}${locked ? " locked" : ""}`} onClick={onClick}>
    <span className="choice-icon">{icon}{locked && <Lock size={13} />}</span><span><strong>{label}</strong><small>{detail}</small></span>{selected && <Check size={15} weight="bold" />}
  </button>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
