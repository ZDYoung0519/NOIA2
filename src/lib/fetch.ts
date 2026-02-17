import { invoke } from "@tauri-apps/api/core";

export const fetchURL = async (url: any, method: string = "GET") => {
  const response = (await invoke("http_request", {
    params: {
      url: url,
      method: method,
      headers: [["User-Agent", "Tauri App"]],
    },
  })) as { status: number; body: string };
  return JSON.parse(response.body);
};
