import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, Settings2, X } from "lucide-react";
import { WindowFrame } from "@/components/window-frame";
import { DpsSettingsPanel } from "@/components/settings-content";
import { useAppTranslation } from "@/hooks/use-app-translation";

function DpsSettingsTitleBar({ title }: { title: string }) {
  const handleMinimize = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.minimize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  return (
    <div className="drag-region text-card-foreground relative z-20 flex h-12 shrink-0 items-center justify-between bg-background/90 px-3.5 select-none">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/80">
          <Settings2 className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-white/92">{title}</span>
          <span className="truncate text-[11px] text-white/48">Settings</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleMinimize}
          className="no-drag-region flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/72 transition hover:bg-white/14 hover:text-white"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="no-drag-region flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/72 transition hover:bg-rose-500/20 hover:text-rose-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useAppTranslation();

  return (
    <WindowFrame
      titleBar={<DpsSettingsTitleBar title={t("settings.title")} />}
      contentClassName="flex flex-1 overflow-hidden"
    >
      <div className="p-4">
        <DpsSettingsPanel />
      </div>
    </WindowFrame>
  );
}
