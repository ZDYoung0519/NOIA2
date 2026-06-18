import { invoke } from "@tauri-apps/api/core";

export type FetchOptions = {
  method?: string;
  headers?: [string, string][];
  body?: unknown;
};

type HttpResponse = {
  status: number;
  body: string;
};

export const fetchURL = async (url: string, options: FetchOptions = {}) => {
  const { method = "GET", headers = [["User-Agent", "Tauri App"]], body } = options;

  const hdrs: [string, string][] = Array.isArray(headers) ? headers : [["User-Agent", "Tauri App"]];

  const params: Record<string, unknown> = {
    url,
    method,
    headers: hdrs,
  };

  if (body !== undefined) {
    params.body = typeof body === "string" ? body : JSON.stringify(body);
    const hasContentType = hdrs.some(([k]) => k.toLowerCase() === "content-type");
    if (!hasContentType) {
      params.headers = [...hdrs, ["Content-Type", "application/json"]];
    }
  }

  const response = (await invoke("http_request", { params })) as HttpResponse;
  return JSON.parse(response.body);
};
