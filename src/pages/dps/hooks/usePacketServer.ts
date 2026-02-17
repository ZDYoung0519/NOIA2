// src/hooks/usePacketServer.ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

type ServerStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export const usePacketServer = () => {
  const [status, setStatus] = useState<ServerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pid, setPid] = useState<number | null>(null);

  const startServer = useCallback(async () => {
    if (status === "running" || status === "starting") return;

    setStatus("starting");
    setError(null);

    try {
      const result: string = await invoke("start_packet_server");
      console.log("Start result:", result);

      // 尝试从返回消息中提取 PID（可选，也可由 Rust 返回结构化数据）
      const pidMatch = result.match(/PID: (\d+)/);
      if (pidMatch) {
        const parsedPid = parseInt(pidMatch[1], 10);
        setPid(parsedPid);
      }

      setStatus("running");
    } catch (err: any) {
      console.error("Failed to start server:", err);
      setError(err?.message || "未知错误");
      setStatus("error");
    }
  }, [status]);

  const stopServer = useCallback(async () => {
    if (status === "stopped" || status === "stopping" || status === "idle")
      return;

    setStatus("stopping");
    console.log("Server", status);

    try {
      await invoke("end_packet_server");
      console.log("Server stopped");
      setStatus("stopped");
      setPid(null);
    } catch (err: any) {
      console.error("Failed to stop server:", err);
      setError(err?.message || "停止服务失败");
      setStatus("error");
    }
  }, [status]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setPid(null);
  }, []);

  return {
    status,
    error,
    pid,
    isRunning: status === "running",
    startServer,
    stopServer,
    reset,
  };
};
