import { useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

import { MainTitleBar } from "@/components/main-title-bar";
import { UpdaterDialog } from "@/components/updater-dialog";
import { WindowFrame } from "@/components/window-frame";
import { useAppTranslation } from "@/hooks/use-app-translation";

export function MainShell({ children }: { children: ReactNode }) {
  const { t } = useAppTranslation();

  useEffect(() => {
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
  }, [t]);

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
