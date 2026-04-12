import { useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { MainTitleBar } from "@/components/main-title-bar";
import { UpdaterDialog } from "@/components/updater-dialog";
import { WindowFrame } from "@/components/window-frame";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { registerShortcut } from "@/lib/shortcut";
import { createWindow, toggleWindow } from "@/lib/window";

export function MainShell({ children }: { children: ReactNode }) {
  const { t } = useAppTranslation();
  const { settings, saveSettings } = useAppSettings();
  const mainShortcut = settings.shortcuts.showMain;
  const dpsShortcut = settings.shortcuts.showDps;

  useEffect(() => {
    const unlistenShortcutChanged = listen<{ shortcut: string }>(
      "shortcut-changed",
      async (event) => {
        const newShortcut = event.payload.shortcut;
        await saveSettings({
          shortcuts: {
            showMain: newShortcut,
          },
        });
        if (newShortcut) {
          await registerShortcut(newShortcut, async () => {
            await toggleWindow("main");
          });
        }
      }
    );

    const initTrayMenu = async () => {
      try {
        await invoke("update_tray_menu", {
          showText: t("tray.show"),
          quitText: t("tray.quit"),
        });
      } catch (error) {
        console.error("Failed to initialize tray menu:", error);
      }
    };
    void initTrayMenu();

    const initShortcut = async () => {
      if (mainShortcut) {
        await registerShortcut(mainShortcut, async () => {
          await toggleWindow("main");
        });
      }

      if (dpsShortcut) {
        await registerShortcut(dpsShortcut, async () => {
          const existingWindow = await WebviewWindow.getByLabel("dps");
          if (existingWindow) {
            await toggleWindow("dps");
            return;
          }

          await createWindow("dps", {
            title: t("dps.title"),
            url: "/dps",
            width: 100,
            height: 400,
            resizable: true,
            maximizable: false,
            minimizable: false,
            decorations: false,
            transparent: true,
            shadow: false,
            alwaysOnTop: true,
          });
        });
      }
    };
    void initShortcut();

    return () => {
      unlistenShortcutChanged.then((fn) => fn());
    };
  }, [dpsShortcut, mainShortcut, saveSettings, t]);

  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      showSidebar
      contentClassName="overflow-auto bg-muted/30"
    >
      <UpdaterDialog />
      {children}
    </WindowFrame>
  );
}
