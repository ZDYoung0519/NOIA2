import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import "./i18n";
import { MainShell } from "./components/main-shell";
import { AppSettingsProvider } from "./hooks/use-app-settings";
import { TooltipProvider } from "./components/ui/tooltip";
import Splash from "./Splash";
import HomePage from "./pages/home";
import DpsViewPage from "./pages/dps_view";
import CharacterScorePage from "./pages/character_score";
import SettingsViewPage from "./pages/settings_view";

const DpsPage = lazy(() => import("./pages/dps"));
const DpsDetailPage = lazy(() => import("./pages/dps_detail"));
const DpsLogPage = lazy(() => import("./pages/dps_log"));
const AboutPage = lazy(() => import("./pages/about"));
const SettingsPage = lazy(() => import("./pages/settings"));

const shellPageMap = {
  "/": HomePage,
  "/dps-view": DpsViewPage,
  "/character-score": CharacterScorePage,
  "/settings-view": SettingsViewPage,
};

const standalonePageMap = {
  "/dps": DpsPage,
  "/dps_detail": DpsDetailPage,
  "/dps_log": DpsLogPage,
  "/about": AboutPage,
  "/settings": SettingsPage,
  "/splash": Splash,
};

function AppWrapper() {
  const [pathname, setPathname] = React.useState(window.location.pathname);

  useEffect(() => {
    getCurrentWindow().show();

    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const StandalonePageComponent =
    standalonePageMap[pathname as keyof typeof standalonePageMap] ?? null;

  if (StandalonePageComponent) {
    return (
      <Suspense fallback={null}>
        <StandalonePageComponent />
      </Suspense>
    );
  }

  const InnerPage = shellPageMap[pathname as keyof typeof shellPageMap] ?? HomePage;
  return (
    <MainShell>
      <InnerPage />
    </MainShell>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppSettingsProvider>
      <TooltipProvider>
        <AppWrapper />
      </TooltipProvider>
    </AppSettingsProvider>
  </React.StrictMode>
);
