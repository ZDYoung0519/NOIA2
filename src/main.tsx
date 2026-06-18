import React, { lazy, useEffect } from "react";
import { ThemeProvider } from "./components/theme-provider";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";

import { WindowFrame } from "./components/window-frame";
import { MainTitleBar } from "./components/main-title-bar";
import { useSettings } from "@/hooks/use-settings";
import { UpdaterDialog } from "@/components/updater-dialog";

const HomePage = lazy(() => import("./pages/home"));
const UserPage = lazy(() => import("./pages/user"));
const SettingsViewPage = lazy(() => import("./pages/settings"));
const Aion2HomePage = lazy(() => import("./games/aion2/pages/home"));
const Aion2CharacterPage = lazy(() => import("./games/aion2/pages/character"));
const Aion2CharacterViewPage = lazy(() => import("./games/aion2/pages/character_view"));
const Aion2DpsRankPage = lazy(() => import("./games/aion2/pages/dps_rank"));

const Aion2OverlaySettingPage = lazy(() => import("./games/aion2/overlay/setting/page"));

import "./index.css";
import "./i18n";

function AppWrapper() {
  useEffect(() => {
    // Show window after React is ready
    getCurrentWindow().show();
  }, []);

  useSettings(); // trigger initial sync on app start (shortcuts, config, etc.)

  return (
    <Routes>
      {/* Main window for aion2*/}
      <Route
        element={
          <WindowFrame titleBar={<MainTitleBar />} showSidebar contentClassName="overflow-auto">
            <UpdaterDialog />
            <Outlet />
          </WindowFrame>
        }
      >
        {/* 通用页 */}
        <Route path="/" element={<Navigate to="/aion2" replace />} />
        <Route path="/user" element={<UserPage />} />
        <Route path="/settings-view" element={<SettingsViewPage />} />

        {/* AION */}
        <Route path="/aion2" element={<Aion2HomePage />} />
        <Route path="/aion2/settings" element={<Aion2HomePage />} />
        <Route path="/aion2/character/search" element={<Aion2CharacterPage />} />
        <Route path="/aion2/character/view" element={<Aion2CharacterViewPage />} />
        <Route path="/aion2/dps-rank" element={<Aion2DpsRankPage />} />

        {/* POE2 */}
        <Route path="/poe2" element={<HomePage />} />
      </Route>

      {/* Overlay windows (no main frame) */}
      <Route element={<Outlet />}>
        <Route path="/aion2/overlay_setting" element={<Aion2OverlaySettingPage />} />
        <Route path="/poe2/item-search/" element=<></> />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="tauri-ui-theme">
      <BrowserRouter>
        <TooltipProvider>
          <AppWrapper />
        </TooltipProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
