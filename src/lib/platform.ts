import { isTauri } from "@tauri-apps/api/core";

if (isTauri()) {
  console.log("Running in Tauri desktop app");
} else {
  console.log("Running in web browser");
}

export const isDesktop = isTauri();
