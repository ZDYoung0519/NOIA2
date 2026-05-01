import { type ReactNode } from "react";
import { MainTitleBar } from "@/components/main-title-bar";
import { UpdaterDialog } from "@/components/updater-dialog";
import { WindowFrame } from "@/components/window-frame";

export function MainShell({ children }: { children: ReactNode }) {
  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      showSidebar
      showTopbar
      contentClassName="overflow-auto bg-background/90"
    >
      <UpdaterDialog />
      {children}
    </WindowFrame>
  );
}
