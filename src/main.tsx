import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import Splash from "./pages/Splash";
import HomePage from "./pages/home";
import DpsClassStatsPage from "./pages/dps_class_stats";
import DpsRankPage from "./pages/dps_rank";

import CharacterPage from "./pages/character";
import CharacterViewPage from "./pages/character_view";
import SettingsViewPage from "./pages/settings_view";
import UserPage from "./pages/user";

import { useAppTranslation } from "@/hooks/use-app-translation";
import { AppSettingsProvider } from "./hooks/use-app-settings";
import { AuthDeepLinkHandler } from "./components/auth-deep-link-handler";
import { TooltipProvider } from "./components/ui/tooltip";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { WindowFrame } from "./components/window-frame";
import { MainTitleBar } from "./components/main-title-bar";
import { UpdaterDialog } from "./components/updater-dialog";

import "./index.css";
import "./i18n";

const DpsPage = lazy(() => import("./pages/dps"));
const DpsDetailPage = lazy(() => import("./pages/dps_detail"));

const DpsV2Page = lazy(() => import("./pages/dps_v2"));
const DpsDetailV2Page = lazy(() => import("./pages/dps_detail_v2"));
const DpsPingPage = lazy(() => import("./pages/dps_ping"));
const DpsSettingPage = lazy(() => import("./pages/dps_settings"));
const DpsLogPage = lazy(() => import("./pages/dps_log"));

function App() {
  const { t } = useAppTranslation();

  useEffect(() => {
    const initTrayMenu = async () => {
      try {
        await invoke("update_tray_menu", {
          showText: t("tray.show"),
          quitText: t("tray.quit"),
        });
      } catch (error) {
        console.error("Failed to initialize tray menu:", error);
      }
    };
    void initTrayMenu();
  }, [t]);

  return (
    <Routes>
      <Route element={<Outlet />}>
        <Route path="/dps" element={<DpsPage />} />
        <Route path="/dps_detail" element={<DpsDetailPage />} />
        <Route path="/dps_v2" element={<DpsV2Page />} />
        <Route path="/dps_detail_v2" element={<DpsDetailV2Page />} />
        <Route path="/dps_ping" element={<DpsPingPage />} />
        <Route path="/dps_settings" element={<DpsSettingPage />} />
        <Route path="/dps_log" element={<DpsLogPage />} />
        <Route path="/splash" element={<Splash />} />
      </Route>

      <Route
        element={
          <WindowFrame titleBar={<MainTitleBar />} showSidebar contentClassName="overflow-auto">
            <UpdaterDialog />
            <Outlet />
          </WindowFrame>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/dps-rank" element={<DpsRankPage />} />
        <Route path="/dps-class-stats" element={<DpsClassStatsPage />} />
        <Route path="/character/search" element={<CharacterPage />} />
        <Route path="/character/view" element={<CharacterViewPage />} />
        <Route path="/settings-view" element={<SettingsViewPage />} />
        <Route path="/user" element={<UserPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppSettingsProvider>
      <ThemeProvider defaultTheme="dark" storageKey="tauri-ui-theme">
        <TooltipProvider>
          <BrowserRouter>
            <AuthDeepLinkHandler />
            <Toaster />
            <App />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AppSettingsProvider>
  </React.StrictMode>
);
