import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Layout } from "./components/Layout";

const NewAnalysis = lazy(() => import("./pages/NewAnalysis"));
const AnalysisProgress = lazy(() => import("./pages/AnalysisProgress"));
const AnalysisResults = lazy(() => import("./pages/AnalysisResults"));
const SavedPapers = lazy(() => import("./pages/SavedPapers"));
const Conversations = lazy(() => import("./pages/Conversations"));
const ConferenceLibrary = lazy(() => import("./pages/ConferenceLibrary"));
const SubmitProgram = lazy(() => import("./pages/SubmitProgram"));
const Account = lazy(() => import("./pages/Account"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteLoadingState() {
  const { lang } = useApp();
  return (
    <div className="route-loader" role="status" aria-live="polite">
      <span className="route-loader-dial" aria-hidden="true" />
      <span className="font-mono text-xs">{lang === "zh" ? "正在校准工作区…" : "Calibrating workspace…"}</span>
    </div>
  );
}

export default function App() {
  const basename = window.location.hostname.endsWith("github.io") ? "/newresearch" : "/";
  return (
    <AppProvider>
      <BrowserRouter basename={basename}>
        <Layout>
          <Suspense fallback={<RouteLoadingState />}>
            <Routes>
              <Route path="/" element={<NewAnalysis />} />
              <Route path="/analysis/progress" element={<AnalysisProgress />} />
              <Route path="/analysis/results" element={<AnalysisResults />} />
              <Route path="/library" element={<ConferenceLibrary />} />
              <Route path="/papers" element={<SavedPapers />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/submit" element={<SubmitProgram />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
