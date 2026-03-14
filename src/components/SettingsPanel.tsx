import { useState, useEffect } from "react";

import { Switch } from "@/components/ui/switch";
import { GlobalAppSettings } from "@/hooks/useSettings";

import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";

interface SettingPanelProps {
  settings: GlobalAppSettings;
  saveSettings: (settings: GlobalAppSettings) => void;
}

export const SettingPanel = ({ settings, saveSettings }: SettingPanelProps) => {
  const [autoStartEnabled, setAutoStartEnabled] = useState<boolean | null>(
    null,
  );

  // 初始化开机启动状态
  useEffect(() => {
    isEnabled()
      .then(setAutoStartEnabled)
      .catch(() => setAutoStartEnabled(false));
  }, []);

  // 更新单个设置并立即保存
  const updateSetting = <K extends keyof GlobalAppSettings>(
    key: K,
    value: GlobalAppSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  const handleAutoStartChange = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
        // await invoke("enable");
        console.log(`registered for autostart? ${await isEnabled()}`);
      } else {
        await disable();
        // await invoke("disable");
        console.log(`registered for autostart? ${await isEnabled()}`);
      }
      setAutoStartEnabled(checked);
      updateSetting("openOnStartup", checked);
    } catch (error) {
      console.error("Failed to update auto-start:", error);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2 simple-scrollbar">
      {/* 显示怪物统计 */}
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">自动检查更新</span>
        <Switch
          checked={settings.autoCheckUpdate}
          onCheckedChange={(checked) =>
            updateSetting("autoCheckUpdate", checked)
          }
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">开机时启动</span>
        <Switch
          checked={autoStartEnabled ?? false}
          onCheckedChange={handleAutoStartChange}
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">启动时自动打开DPS</span>
        <Switch
          checked={settings.openDpsOnStartup}
          onCheckedChange={(checked) =>
            updateSetting("openDpsOnStartup", checked)
          }
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>
    </div>
  );
};
