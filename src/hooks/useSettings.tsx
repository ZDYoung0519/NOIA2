import { useState, useEffect } from "react";

export interface GlobalAppSettings {
  openOnStartup: boolean; // 电脑开机时启动
  autoCheckUpdate: boolean; // 自动检查更新

  gamePath?: string; // 游戏路径，供未来使用
}

const defaultSettings: GlobalAppSettings = {
  autoCheckUpdate: true,
  openOnStartup: false,

  gamePath: "",
};

const STORAGE_KEY = "app-settings";

export const useGlobalAppSettings = () => {
  const [settings, setSettings] = useState<GlobalAppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        let loadedSettings = defaultSettings;

        if (saved) {
          loadedSettings = { ...defaultSettings, ...JSON.parse(saved) };
        }

        setSettings(loadedSettings);
      } catch (error) {
        console.warn("加载设置失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
    return () => {};
  }, []);

  // 保存设置
  const saveSettings = async (newSettings: GlobalAppSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.warn("保存设置失败:", error);
    }
  };

  return {
    settings,
    saveSettings,
    isLoading,
  };
};
