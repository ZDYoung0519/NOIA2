import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import "./i18n";

const HomePage = lazy(() => import("./pages/home"));
const DpsPage = lazy(() => import("./pages/dps"));
const DpsDetailPage = lazy(() => import("./pages/dps_detail"));
const AboutPage = lazy(() => import("./pages/about"));
const SettingsPage = lazy(() => import("./pages/settings"));

const pageMap = {
  "/": HomePage,
  "/dps": DpsPage,
  "/dps_detail": DpsDetailPage,
  "/about": AboutPage,
  "/settings": SettingsPage,
};

const pathname = window.location.pathname;
const PageComponent = pageMap[pathname as keyof typeof pageMap] ?? HomePage;

function AppWrapper() {
  useEffect(() => {
    // Show window after React is ready
    getCurrentWindow().show();
  }, []);

  return <PageComponent />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <AppWrapper />
    </Suspense>
  </React.StrictMode>
);
