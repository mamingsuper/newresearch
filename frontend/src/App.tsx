import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { Layout } from "./components/Layout";
import NewAnalysis from "./pages/NewAnalysis";
import AnalysisProgress from "./pages/AnalysisProgress";
import AnalysisResults from "./pages/AnalysisResults";
import SavedPapers from "./pages/SavedPapers";
import Conversations from "./pages/Conversations";
import ConferenceLibrary from "./pages/ConferenceLibrary";
import SubmitProgram from "./pages/SubmitProgram";
import Account from "./pages/Account";

export default function App() {
  const basename = window.location.hostname.endsWith("github.io") ? "/newresearch" : "/";
  return (
    <AppProvider>
      <BrowserRouter basename={basename}>
        <Layout>
          <Routes>
            <Route path="/" element={<NewAnalysis />} />
            <Route path="/analysis/progress" element={<AnalysisProgress />} />
            <Route path="/analysis/results" element={<AnalysisResults />} />
            <Route path="/library" element={<ConferenceLibrary />} />
            <Route path="/papers" element={<SavedPapers />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/submit" element={<SubmitProgram />} />
            <Route path="/account" element={<Account />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
