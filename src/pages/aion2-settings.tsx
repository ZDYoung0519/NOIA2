// =============================================================================
// Standalone Aion2 Settings page (loaded in overlay settings window)
// =============================================================================

import { Toaster } from "@/components/ui/sonner";
import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { Aion2Settings } from "@/components/aion2-settings";

export default function Aion2SettingsPage() {
  const { t } = useAppTranslation();

  return (
    <WindowFrame
      titleBar={<TitleBar title={t("settings.aion2.title")} showMaximize={false} />}
      contentClassName="flex-1 overflow-auto p-4"
    >
      <Toaster />
      <Aion2Settings />
    </WindowFrame>
  );
}
