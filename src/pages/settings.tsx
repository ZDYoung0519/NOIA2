import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { SettingsContent } from "@/components/settings-content";
import { useAppTranslation } from "@/hooks/use-app-translation";

export default function SettingsPage() {
  const { t } = useAppTranslation();

  return (
    <WindowFrame
      titleBar={<TitleBar title={t("settings.title")} showMaximize={false} />}
      contentClassName="flex flex-1 overflow-hidden"
    >
      <SettingsContent />
    </WindowFrame>
  );
}
