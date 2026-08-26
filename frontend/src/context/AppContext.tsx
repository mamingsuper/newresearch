import { createContext, useContext, useState, useEffect, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Lang } from "../i18n";
import type { AnalysisOptions, AnalysisReport, Paper } from "../types";
import type { Session } from "@supabase/supabase-js";
import { auth } from "../adapters/auth";
import { billing } from "../adapters/billing";
import { supabase } from "../adapters/supabase";
import { papers as paperAdapter } from "../adapters/papers";

export interface UserState {
  id: string;
  email: string;
  plan: "free" | "pro";
  analysesRemainingToday: number;
  superRemaining: number;
  superMonthlyLimit: number;
  savedPapersCount: number;
  conversationsCount: number;
}

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  darkMode: boolean;
  toggleDark: () => void;
  user: UserState | null;
  setUser: (u: UserState | null) => void;
  authReady: boolean;
  refreshUser: () => Promise<void>;
  showAuth: boolean;
  setShowAuth: (v: boolean) => void;
  authReturnPath: string | null;
  setAuthReturnPath: (p: string | null) => void;
  pendingIdea: string;
  setPendingIdea: (s: string) => void;
  analysisOptions: AnalysisOptions;
  setAnalysisOptions: Dispatch<SetStateAction<AnalysisOptions>>;
  currentReport: AnalysisReport | null;
  setCurrentReport: (r: AnalysisReport | null) => void;
  savedPaperIds: Set<string>;
  toggleSavedPaper: (paper: Paper) => void;
  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const [darkMode, setDarkMode] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [user, setUser] = useState<UserState | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authReturnPath, setAuthReturnPath] = useState<string | null>(null);
  const [pendingIdea, setPendingIdea] = useState(() => sessionStorage.getItem("idea-radar-pending-idea") ?? "");
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({
    model: "default",
    effort: "standard",
    matchCount: 10,
    externalProcessingConsent: false,
    clientRequestId: crypto.randomUUID(),
    attachments: [],
  });
  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(() => {
    try {
      const saved = sessionStorage.getItem("idea-radar-current-report");
      return saved ? JSON.parse(saved) as AnalysisReport : null;
    } catch {
      return null;
    }
  });
  const [savedPaperIds, setSavedPaperIds] = useState<Set<string>>(new Set());
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (pendingIdea) sessionStorage.setItem("idea-radar-pending-idea", pendingIdea);
    else sessionStorage.removeItem("idea-radar-pending-idea");
  }, [pendingIdea]);

  useEffect(() => {
    if (currentReport) sessionStorage.setItem("idea-radar-current-report", JSON.stringify(currentReport));
    else sessionStorage.removeItem("idea-radar-current-report");
  }, [currentReport]);

  async function hydrateUser(session: Session | null) {
    if (!session?.user) {
      setUser(null);
      setAuthReady(true);
      return;
    }

    const [statusResult, savedResult, sessionsResult] = await Promise.allSettled([
      billing.status(),
      supabase.rpc("get_my_saved_papers"),
      supabase.from("analysis_sessions").select("id", { count: "exact", head: true }),
    ]);
    const status = statusResult.status === "fulfilled" ? statusResult.value : null;
    const savedRows = savedResult.status === "fulfilled" && Array.isArray(savedResult.value.data) ? savedResult.value.data : [];
    const savedCount = savedRows.length;
    const conversationsCount = sessionsResult.status === "fulfilled" ? sessionsResult.value.count ?? 0 : 0;

    setUser({
      id: session.user.id,
      email: session.user.email ?? "Signed-in researcher",
      plan: status?.plan ?? "free",
      analysesRemainingToday: status?.remaining ?? 1,
      superRemaining: status?.superRemaining ?? 0,
      superMonthlyLimit: status?.superMonthlyLimit ?? 5,
      savedPapersCount: savedCount,
      conversationsCount,
    });
    setSavedPaperIds(new Set(savedRows.map((row) => String((row as Record<string, unknown>).paper_id ?? (row as Record<string, unknown>).paperId ?? "")).filter(Boolean)));
    setAuthReady(true);
  }

  async function refreshUser() {
    const session = await auth.getSession();
    await hydrateUser(session);
  }

  useEffect(() => {
    void refreshUser();
    const subscription = auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void hydrateUser(session));
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDark() {
    setDarkMode((d) => !d);
  }

  function toggleSavedPaper(paper: Paper) {
    if (!user) return;
    const removing = savedPaperIds.has(paper.id);
    setSavedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paper.id)) {
        next.delete(paper.id);
      } else {
        next.add(paper.id);
      }
      return next;
    });
    void (removing ? paperAdapter.remove(paper.id) : paperAdapter.save(paper)).then((result) => {
      if (!result.ok) {
        setSavedPaperIds((prev) => {
          const rollback = new Set(prev);
          if (removing) rollback.add(paper.id); else rollback.delete(paper.id);
          return rollback;
        });
      } else void refreshUser();
    });
  }

  return (
    <AppContext.Provider
      value={{
        lang, setLang,
        darkMode, toggleDark,
        user, setUser, authReady, refreshUser,
        showAuth, setShowAuth,
        authReturnPath, setAuthReturnPath,
        pendingIdea, setPendingIdea, analysisOptions, setAnalysisOptions,
        currentReport, setCurrentReport,
        savedPaperIds, toggleSavedPaper,
        showPaywall, setShowPaywall,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
