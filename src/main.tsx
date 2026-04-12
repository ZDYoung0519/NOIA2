import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import "./i18n";
import { MainShell } from "./components/main-shell";

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
};

function AppWrapper() {
  const [pathname, setPathname] = React.useState(window.location.pathname);

  useEffect(() => {
    // Show window after React is ready
    getCurrentWindow().show();

    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const ShellPageComponent =
    shellPageMap[pathname as keyof typeof shellPageMap] ?? null;
  const StandalonePageComponent =
    standalonePageMap[pathname as keyof typeof standalonePageMap] ?? null;

  if (StandalonePageComponent) {
    return <StandalonePageComponent />;
  }

  const InnerPage = ShellPageComponent ?? HomePage;
  return (
    <MainShell>
      <InnerPage />
    </MainShell>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <AppWrapper />
    </Suspense>
  </React.StrictMode>
);
