import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

type RuntimeCheck = {
  available: boolean;
  errorCode?: number | null;
  error?: string | null;
};

type RuntimeStatus = {
  windivert: RuntimeCheck;
  npcap: RuntimeCheck;
};

type RepairResult = {
  success: boolean;
  steps: string[];
  error?: string | null;
};

type CheckState = "checking" | "ready" | "warning";

const WEBP_REPLAY_INTERVAL_MS = 3500;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function RuntimeRow({
  label,
  description,
  status,
  action,
}: {
  label: string;
  description: string;
  status?: RuntimeCheck;
  action?: ReactNode;
}) {
  const available = status?.available === true;
  const checked = status != null;

  return (
    <div className="border-border/55 bg-background/40 flex items-center gap-3 rounded-xl border px-3.5 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
        {checked ? (
          available ? (
            <CheckCircle2 className="size-4 text-cyan-300" />
          ) : (
            <TriangleAlert className="size-4 text-amber-300" />
          )
        ) : (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground text-sm font-medium">{label}</span>
          <span className={available ? "text-xs text-cyan-300" : "text-muted-foreground text-xs"}>
            {!checked ? "检测中" : available ? "可用" : "不可用"}
          </span>
        </div>
        <p
          className="text-muted-foreground mt-0.5 truncate text-xs"
          title={status?.error ?? description}
        >
          {status?.error ?? description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default function StartupSplashPage() {
  const [searchParams] = useSearchParams();
  const manualMode = searchParams.get("manual") === "1";
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [state, setState] = useState<CheckState>("checking");
  const [repairingWindivert, setRepairingWindivert] = useState(false);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [windivertRepairOpen, setWindivertRepairOpen] = useState(false);
  const [repairSteps, setRepairSteps] = useState<string[]>([]);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [webpReplayKey, setWebpReplayKey] = useState(0);

  async function checkRuntime({ delay = 0 }: { delay?: number } = {}) {
    if (delay > 0) {
      await sleep(delay);
    }

    const nextStatus = await invoke<RuntimeStatus>("check_capture_runtime_status");
    const canCapture = nextStatus.windivert.available || nextStatus.npcap.available;
    setStatus(nextStatus);
    setState(canCapture ? "ready" : "warning");
    return canCapture;
  }

  async function recheckRuntime() {
    setCheckingRuntime(true);
    setState("checking");
    setRepairSteps([]);
    try {
      await checkRuntime();
    } catch (error) {
      setStatus({
        windivert: {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        },
        npcap: {
          available: false,
          error: "检测失败",
        },
      });
      setState("warning");
    } finally {
      setCheckingRuntime(false);
    }
  }

  async function openMainWindow() {
    const main = await Window.getByLabel("main");
    await main?.show();
    await main?.unminimize();
    await main?.setFocus();
    await getCurrentWindow().close();
  }

  function enterAppSoon() {
    window.setTimeout(() => {
      openMainWindow().catch(() => {});
    }, 1000);
  }

  async function repairWindivert() {
    setRepairingWindivert(true);
    setRepairResult(null);
    setRepairSteps(["用户已选择手动修复 WinDivert"]);
    try {
      const result = await invoke<RepairResult>("repair_windivert_runtime");
      setRepairResult(result);
      setRepairSteps(result.steps);
      const canCapture = await checkRuntime();
      if (!manualMode && result.success && canCapture) {
        enterAppSoon();
      }
    } catch (error) {
      setRepairSteps([
        "修复失败",
        error instanceof Error ? error.message : String(error),
        "如果安装在 Program Files，请以管理员身份运行 NoiA 后重试。",
      ]);
      setRepairResult({
        success: false,
        steps: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRepairingWindivert(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runChecks() {
      const startedAt = Date.now();
      try {
        const canCapture = await checkRuntime({ delay: 2000 });
        if (cancelled) return;

        if (!canCapture || manualMode) {
          return;
        }
      } catch (error) {
        if (cancelled) return;

        setStatus({
          windivert: {
            available: false,
            error: error instanceof Error ? error.message : String(error),
          },
          npcap: {
            available: false,
            error: "检测失败",
          },
        });
        setState("warning");
        return;
      }

      const elapsed = Date.now() - startedAt;
      window.setTimeout(
        () => {
          if (!cancelled) {
            openMainWindow().catch(() => {});
          }
        },
        Math.max(0, 3000 - elapsed)
      );
    }

    runChecks();

    return () => {
      cancelled = true;
    };
  }, [manualMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWebpReplayKey((current) => current + 1);
    }, WEBP_REPLAY_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const title =
    state === "checking"
      ? "正在检查抓包驱动"
      : state === "ready"
        ? manualMode
          ? "抓包驱动已就绪（任一可用即可）"
          : "抓包驱动已就绪（任一可用即可），即将进入 App"
        : "抓包驱动不可用（至少需要一个可用）";

  return (
    <div
      className="text-foreground flex h-screen w-screen items-center justify-center overflow-hidden rounded-2xl bg-zinc-950 select-none"
      data-tauri-drag-region
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_82%_86%,rgba(99,102,241,0.18),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-cyan-950/24 to-transparent" />

      <main className="relative grid w-full max-w-[580px] grid-cols-[190px_1fr] items-center gap-5 px-7">
        <section className="flex flex-col items-center gap-3">
          <div className="relative flex size-40 items-center justify-center">
            <div className="absolute inset-3 rounded-[2.5rem] bg-cyan-300/10 blur-2xl" />
            <img
              key={webpReplayKey}
              src={`/aion2.webp?replay=${webpReplayKey}`}
              alt="AION2"
              className="absolute size-36 object-contain drop-shadow-[0_18px_48px_rgba(8,145,178,0.32)]"
              draggable={false}
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-200/12 bg-cyan-300/8 px-2.5 py-1 text-xs text-cyan-100/85">
            {state === "checking" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ShieldCheck className="size-3" />
            )}
            <span>NoiA</span>
          </div>
          {status != null && (
            <button
              type="button"
              className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-cyan-200/12 bg-cyan-300/8 px-3 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-300/14 disabled:cursor-not-allowed disabled:opacity-60"
              data-tauri-drag-region="false"
              disabled={checkingRuntime || repairingWindivert}
              onClick={() => void recheckRuntime()}
            >
              {checkingRuntime ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              重新检测
            </button>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal text-white">NoiA</h1>
              <p className="mt-1 text-sm text-zinc-400">{title}</p>
            </div>
            {manualMode && (
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-100"
                data-tauri-drag-region="false"
                onClick={() => void getCurrentWindow().close()}
                aria-label="关闭检测窗口"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <RuntimeRow
              label="Npcap"
              description="作为优先封包捕获方案"
              status={status?.npcap}
              action={
                status?.npcap.available === false ? (
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/7 px-2.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10"
                    data-tauri-drag-region="false"
                    onClick={() => void openUrl("https://npcap.com/dist/npcap-1.87.exe")}
                  >
                    <Download className="size-3.5" />
                    下载
                  </button>
                ) : null
              }
            />
            <RuntimeRow
              label="WinDivert"
              description="作为备用驱动级封包捕获方案"
              status={status?.windivert}
              action={
                status?.windivert.available === false ? (
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-cyan-200/14 bg-cyan-300/10 px-2.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-300/16 disabled:cursor-not-allowed disabled:opacity-60"
                    data-tauri-drag-region="false"
                    disabled={repairingWindivert}
                    onClick={() => {
                      setRepairResult(null);
                      setRepairSteps([]);
                      setWindivertRepairOpen(true);
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    修复
                  </button>
                ) : null
              }
            />
          </div>

          {state === "warning" && (
            <p className="text-xs leading-relaxed text-zinc-500">
              WinDivert 修复会下载 WinDivert64.sys 并写入安装目录；安装 Npcap 时请勾选 WinPcap
              API-compatible Mode，安装完成后重启 NoiA。
            </p>
          )}

          <footer className="flex items-center gap-2 text-xs text-zinc-500">
            <Wifi className="size-3.5" />
            <span>
              {state === "checking"
                ? manualMode
                  ? "正在检测抓包环境"
                  : "检测完成后将自动进入主界面"
                : state === "ready"
                  ? manualMode
                    ? "当前抓包环境可用"
                    : "正在运行..."
                  : "请手动安装 Npcap 或手动修复 WinDivert 后重启"}
            </span>
          </footer>
        </section>
      </main>

      <Dialog open={windivertRepairOpen} onOpenChange={setWindivertRepairOpen}>
        <DialogContent
          className="border-white/10 bg-zinc-950/96 text-zinc-100 sm:max-w-md"
          data-tauri-drag-region="false"
        >
          <DialogHeader>
            <DialogTitle>手动修复 WinDivert</DialogTitle>
            <DialogDescription>
              将下载 WinDivert64.sys
              并写入程序安装目录。若安装目录需要管理员权限，请以管理员身份运行 NoiA 后重试。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
              仅在你点击“开始修复”后才会下载和写入文件。修复完成后会自动重新检测 WinDivert。
            </div>

            {repairSteps.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                {repairSteps.map((step, index) => (
                  <div key={`${index}-${step}`} className="truncate" title={step}>
                    {index + 1}. {step}
                  </div>
                ))}
              </div>
            )}

            {repairResult && (
              <div
                className={
                  repairResult.success
                    ? "rounded-lg border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-xs text-cyan-100"
                    : "rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs text-amber-100"
                }
              >
                {repairResult.success
                  ? "WinDivert 修复完成。"
                  : repairResult.error || "WinDivert 修复失败。"}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={repairingWindivert}
              onClick={() => setWindivertRepairOpen(false)}
            >
              关闭
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={repairingWindivert}
              onClick={() => void repairWindivert()}
            >
              {repairingWindivert && <Loader2 className="animate-spin" data-icon="inline-start" />}
              开始修复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
