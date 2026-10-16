import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeProvider";
import { resumeRuns } from "@/lib/jobs";
import Layout from "@/pages/Layout";
import HomePage from "@/pages/HomePage";
import CasePage from "@/pages/CasePage";
import RunPage from "@/pages/RunPage";

export default function App() {
  useEffect(() => {
    resumeRuns().catch((e) => console.error("[jobs] resume failed", e));
  }, []);

  return (
    <ThemeProvider storageKey="vite-ui-theme">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="cases/:caseId" element={<CasePage />} />
          <Route path="cases/:caseId/runs/:jobId" element={<RunPage />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
}
