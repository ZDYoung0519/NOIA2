import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import AppLayout from "./AppLayout";

import Splash from "./pages/Splash";
import Home from "./pages/home";
import ChangelogPage from "./pages/ChangelogPage";
import NotFound from "./pages/NotFoundPage";
import DpsMeterPage from "./pages/dps/page";
import CharacterSearchPage from "./pages/character/page";
import CharacterViewPage from "./pages/character_view/page";
import DPSViewPage from "./pages/dps_view/page";
import RanksScrapyPage from "./pages/ranks/page";
import Aion2Layout from "./pages/layout";
import RanksDBPage from "./pages/ranks_db/page";
import BuildsPage from "./pages/builds/page";
import MacroApp from "./pages/macro/page";

import "./App.css";
import "./i18n/index";

import { useUpdater } from "./updater";
import { useEffect } from "react";

// import ThemeProvider from "@/components/theme-provider";

import { invoke } from "@tauri-apps/api/core";

// 正确的sleep函数实现
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function App() {
  const { checkUpdate, UpdateDialog } = useUpdater();
  async function setup() {
    checkUpdate();
    await sleep(3);
    try {
      await invoke("set_complete", { task: "frontend" });
      console.log("Frontend completion signaled to backend");
    } catch (error) {
      console.error("Failed to signal completion:", error);
    }
  }

  useEffect(() => {
    setup().catch(console.error);
  }, []);

  return (
    <Router>
      {UpdateDialog}
      <Routes>
        {/* 使用AppLayout的路由 - 使用嵌套路由 */}
        <Route element={<AppLayout />}>
          <Route path="*" element={<NotFound />} />
          <Route element={<Aion2Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/character" element={<CharacterSearchPage />} />
            <Route path="/character/view" element={<CharacterViewPage />} />
            <Route path="/macro" element={<MacroApp />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/ranks_scrapy" element={<RanksScrapyPage />} />
            <Route path="/ranks" element={<RanksDBPage />} />
            <Route path="/dps/view" element={<DPSViewPage />} />
          </Route>
        </Route>

        {/* 不使用AppLayout的路由 */}
        <Route path="/splash" element={<Splash />} />
        <Route path="/dps" element={<DpsMeterPage />} />
      </Routes>
    </Router>
    // <>isDesktop{isDesktop.toString()}</>
  );
}

export default App;
