import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AboutPage } from "./pages/about";
import "./index.css";

const pathname = window.location.pathname;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {pathname === "/about" ? <AboutPage /> : <App />}
  </React.StrictMode>
);
