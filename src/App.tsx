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

async function setup() {
  // Fake perform some really heavy setup task
  console.log("Performing really heavy frontend setup task...");

  // 修复：需要await sleep，否则不会等待
  await sleep(3); // 模拟3秒的耗时操作

  console.log("Frontend setup task complete!");

  // Set the frontend task as being completed
  try {
    await invoke("set_complete", { task: "frontend" });
    console.log("Frontend completion signaled to backend");
  } catch (error) {
    console.error("Failed to signal completion:", error);
  }
}

function App() {
  const { checkUpdate, UpdateDialog } = useUpdater();

  useEffect(() => {
    // 检查更新
    checkUpdate();

    // 执行模拟的设置任务
    setup().catch(console.error);

    // 移除重复的invoke调用，因为setup中已经调用了
    // invoke("set_complete", { task: "frontend" }).catch(console.error);
  }, []); // 空依赖数组，只在组件挂载时执行一次

  return (
    <Router>
      {UpdateDialog}
      <Routes>
        {/* <ThemeProvider attribute="class" defaultTheme="dark"> */}
        <Route path="/splash" element={<Splash />} />

        {/* 使用AppLayout的路由 - 使用嵌套路由 */}
        <Route element={<AppLayout />}>
          <Route path="*" element={<NotFound />} />

          {/* <Route path="/changelog" element={<ChangelogPage />} /> */}

          <Route element={<Aion2Layout />}>
            <Route path="/" element={<Home />} />

            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/character" element={<CharacterSearchPage />} />
            <Route path="/character/view" element={<CharacterViewPage />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/ranks_scrapy" element={<RanksScrapyPage />} />
            <Route path="/ranks" element={<RanksDBPage />} />
            <Route path="/dps/view" element={<DPSViewPage />} />
          </Route>
        </Route>
        {/* </ThemeProvider> */}

        {/* 不使用AppLayout的路由 */}
        <Route path="/dps" element={<DpsMeterPage />} />

        {/* <Route path="/login" element={<Login />} /> */}
      </Routes>
    </Router>
    // <>isDesktop{isDesktop.toString()}</>
  );
}

export default App;
