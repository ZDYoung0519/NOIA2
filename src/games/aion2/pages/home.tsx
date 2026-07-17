import { useEffect, useState } from "react";
import { Megaphone, Menu, ScrollText, ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useNavigate } from "react-router-dom";
import { DpsMeterLauncherButton } from "@/games/aion2/components/dps-meter-launcher-button";
import { DpsLightGuideDialog } from "@/games/aion2/components/dps-light-guide-dialog";
import { HomeNewsCarousel } from "@/games/aion2/components/home-news-carousel";
import { HomeCharacterCarousel } from "../components/home-character-carousel";
import {
  fetchHomeAnnouncement,
  type HomeAnnouncement,
} from "@/games/aion2/lib/fetchHomeAnnouncement";
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
  const [announcement, setAnnouncement] = useState<HomeAnnouncement | null>(null);
  const { t } = useAppTranslation();
  const { config, updateSettings } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    fetchHomeAnnouncement()
      .then((nextAnnouncement) => {
        if (cancelled) return;
        setAnnouncement(nextAnnouncement);
      })
      .catch(() => {
        if (cancelled) return;
        setAnnouncement(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          <div className="flex w-full items-start justify-between gap-12">
            <div className="w-[450px] shrink-0">
              <HomeNewsCarousel />
            </div>

            <div className="ml-auto w-[400px] shrink-0">
              <HomeCharacterCarousel />
            </div>
          </div>
        </div>
      </main>

      {announcement ? (
        <section className="pointer-events-none absolute right-10 bottom-28 z-30 w-[520px] max-w-[calc(100vw-5rem)]">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#F4C06A]/25 bg-[#F4C06A]/10 text-[#F4C06A]">
                <Megaphone size={17} />
              </div>

              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-[0.18em] text-[#F4C06A]/90 uppercase">
                    {announcement.title}
                  </span>
                  <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/65">
                    {announcement.badge}
                  </span>
                </div>
                <div className="relative overflow-hidden text-sm whitespace-nowrap text-white/82">
                  <div className="inline-flex min-w-full animate-[aion2-home-marquee_18s_linear_infinite] gap-12">
                    <span>{announcement.message}</span>
                    <span aria-hidden="true">{announcement.message}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes aion2-home-marquee {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
          `}</style>
        </section>
      ) : null}

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
    </div>
  );
}
