import { useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { DpsMeterLauncherButton } from "@/components/dps-meter-launcher-button";
import { DpsLightGuideDialog } from "@/components/dps-light-guide-dialog";
import { HomeCharacterCarousel } from "@/components/home-character-carousel";
import { HomeNewsCarousel } from "@/components/home-news-carousel";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function HomePage() {
  const [showLightDialog, setShowLightDialog] = useState(false);
  const { settings, saveSettings } = useAppSettings();
  const autoCloseMain = settings.autoCloseMainOnStartup;
  const navigate = useNavigate();

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
                使用指南
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  navigate("/settings-view");
                }}
              >
                应用设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DpsMeterLauncherButton />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-white drop-shadow">
          <button
            type="button"
            onClick={() => {
              const next = !autoCloseMain;
              void saveSettings({ autoCloseMainOnStartup: next });
            }}
            className="flex h-4 w-4 items-center justify-center rounded-sm border-2 border-white"
            aria-label="启动软件后自动关闭主窗口（减少负担）"
          >
            {autoCloseMain ? <span className="text-[11px] leading-none text-white">✓</span> : null}
          </button>
          启动水表悬浮窗后，自动关闭主窗口（减少运行负担）
        </label>
      </section>

      <DpsLightGuideDialog open={showLightDialog} onOpenChange={setShowLightDialog} />
    </div>
  );
}
