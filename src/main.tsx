import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import "./index.css";
import "./i18n";
import { AuthDeepLinkHandler } from "./components/auth-deep-link-handler";
import { MainShell } from "./components/main-shell";
import { AppSettingsProvider } from "./hooks/use-app-settings";
import { TooltipProvider } from "./components/ui/tooltip";
import Splash from "./pages/Splash";

import HomePage from "./pages/home";
import DpsViewPage from "./pages/dps_view";
import HistoryBattleQueryPage from "./pages/history_battle_query";
import CharacterPage from "./pages/character";
import CharacterViewPage from "./pages/character_view";
import SettingsViewPage from "./pages/settings_view";
import UserPage from "./pages/user";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { ThemeProvider } from "./components/theme-provider";

import { useAppSettings } from "@/hooks/use-app-settings";

const DpsPage = lazy(() => import("./pages/dps"));
const DpsPingPage = lazy(() => import("./pages/dps_ping"));
const DpsSettingPage = lazy(() => import("./pages/dps_settings"));
const DpsDetailPage = lazy(() => import("./pages/dps_detail"));
const DpsLogPage = lazy(() => import("./pages/dps_log"));
const AboutPage = lazy(() => import("./pages/about"));

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

  const { saveSettings } = useAppSettings();

  useEffect(() => {
    void saveSettings({
      dpsMeter: {
        maxPacketSizeThreshold: Number(8192),
      },
    });
  }, []);

  return (
    <Routes>
      <Route element={<Outlet />}>
        <Route path="/dps" element={<DpsPage />} />
        <Route path="/dps_ping" element={<DpsPingPage />} />
        <Route path="/dps_settings" element={<DpsSettingPage />} />
        <Route path="/dps_detail" element={<DpsDetailPage />} />
        <Route path="/dps_log" element={<DpsLogPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/splash" element={<Splash />} />
      </Route>

      <Route
        element={
          <MainShell>
            <Outlet />
          </MainShell>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/dps-view" element={<DpsViewPage />} />
        <Route path="/history-battle-query" element={<HistoryBattleQueryPage />} />
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
            <App />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AppSettingsProvider>
  </React.StrictMode>
);
