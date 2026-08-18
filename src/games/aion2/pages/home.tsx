import { useState } from "react";
import { ExternalLink, Menu, Rocket, ScrollText, ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DpsMeterLauncherButton } from "@/games/aion2/components/dps-meter-launcher-button";
import { DpsLightGuideDialog } from "@/games/aion2/components/dps-light-guide-dialog";
import { HomeCharacterCarousel } from "../components/home-character-carousel";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useSettings } from "@/hooks/use-settings";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function HomePage() {
  const [showLightDialog, setShowLightDialog] = useState(false);
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(true);
  const { t } = useAppTranslation();
  const { config, updateSettings } = useSettings();
  const navigate = useNavigate();

  const openCaptureCheckWindow = async () => {
    const existing = await WebviewWindow.getByLabel("splashscreen");
    if (existing) {
      await existing.show();
      await existing.unminimize();
      await existing.setFocus();
      return;
    }

    const window = new WebviewWindow("splashscreen", {
      url: "/splashscreen?manual=1",
      title: "抓包检测",
      width: 640,
      height: 460,
      decorations: false,
      transparent: true,
      center: true,
      resizable: false,
      shadow: true,
    });

    window.once("tauri://created", () => {
      void window.setFocus();
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent text-white">
      <main className="absolute inset-0 z-20 overflow-hidden">
        <div className="h-full overflow-y-auto px-10 pt-10 pb-0">
          <div className="flex w-full items-start justify-end">
            <div className="ml-auto w-[400px] shrink-0">
              <HomeCharacterCarousel />
            </div>
          </div>
        </div>
      </main>

      <section className="absolute right-10 bottom-10 z-30 flex flex-col items-end gap-2">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-[54px] w-[66px] items-center justify-center rounded-l-md bg-black/45 backdrop-blur-xl transition hover:bg-black/60">
                <Menu size={30} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-36 p-1">
              <DropdownMenuItem
                onClick={() => {
                  setShowLightDialog(true);
                }}
              >
                {t("aion2Home.usageGuide")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  navigate("/settings-view");
                }}
              >
                {t("aion2Home.appSettings")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  openCaptureCheckWindow().catch(() => {});
                }}
              >
                <ShieldCheck size={16} className="mr-2" />
                抓包驱动诊断
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  invoke("create_dps_log").catch(() => {});
                }}
              >
                <ScrollText size={16} className="mr-2" />
                {t("aion2Home.dpsLog")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DpsMeterLauncherButton />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-white drop-shadow">
          <button
            type="button"
            onClick={() => {
              void updateSettings("aion2.autoCloseMain", !config.aion2.autoCloseMain);
            }}
            className="flex h-4 w-4 items-center justify-center rounded-sm border-2 border-white"
            aria-label="启动软件后自动关闭主窗口（减少负担）"
          >
            {config.aion2.autoCloseMain ? (
              <span className="text-[11px] leading-none text-white">✓</span>
            ) : null}
          </button>
          启动水表悬浮窗后，自动关闭主窗口（减少运行负担）
        </label>
      </section>

      <DpsLightGuideDialog open={showLightDialog} onOpenChange={setShowLightDialog} />

      <Dialog open={showUpgradeNotice} onOpenChange={setShowUpgradeNotice}>
        <DialogContent className="border-primary/40 bg-background/90 overflow-hidden shadow-2xl backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader className="gap-4 text-left">
            <div className="flex items-start gap-4">
              <div className="bg-primary/15 text-primary flex size-12 shrink-0 items-center justify-center rounded-xl">
                <Rocket className="size-6" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <DialogTitle className="text-2xl">NoiA 5.0 已全面升级</DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  由于架构发生变化，当前渠道无法自动更新至 5.0。请前往官网下载安装最新版本。
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">官方网站</span>
              <span className="font-medium">noia2.top</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">意见和测试群</span>
              <span className="font-medium tabular-nums">1093399101</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeNotice(false)}>
              稍后处理
            </Button>
            <Button onClick={() => void openUrl("https://noia2.top/")}>
              <ExternalLink data-icon="inline-start" />
              前往官网下载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
