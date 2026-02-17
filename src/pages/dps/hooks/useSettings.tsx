import { useState, useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

export interface AppSettings {
  bgOpacity: number;
  mainPlayerColor: string; // rgba格式
  otherPlayerColor: string; // rgba格式
  resetShortcut: string; // 快捷键，如 "Alt+Q"
  showMob: boolean;
  maxDisplayCount: number; // 最大显示数量
  showMobStats: boolean; // 显示怪物统计
}

const defaultSettings: AppSettings = {
  bgOpacity: 85,
  mainPlayerColor: "rgba(212, 112, 12, 0.66)",
  otherPlayerColor: "rgba(22, 53, 228, 0.44)",
  resetShortcut: "Alt+Q",
  showMob: true,
  maxDisplayCount: 8,
  showMobStats: true,
};

const STORAGE_KEY = "dps-settings";

// 全局快捷键注册状态
let currentRegisteredShortcut: string | null = null;

// 注册快捷键的辅助函数
const registerResetShortcut = async (
  shortcut: string,
  callback: () => void,
): Promise<boolean> => {
  try {
    // 先取消现有的
    if (currentRegisteredShortcut) {
      await unregister(currentRegisteredShortcut);
    }

    // 注册新的
    await register(shortcut, callback);
    currentRegisteredShortcut = shortcut;
    console.log(`快捷键已注册: ${shortcut}`);
    return true;
  } catch (error) {
    console.error(`注册快捷键失败 ${shortcut}:`, error);
    return false;
  }
};

const unregisterResetShortcut = async (): Promise<void> => {
  if (currentRegisteredShortcut) {
    try {
      await unregister(currentRegisteredShortcut);
      console.log(`快捷键已取消: ${currentRegisteredShortcut}`);
      currentRegisteredShortcut = null;
    } catch (error) {
      console.error("取消注册快捷键失败:", error);
    }
  }
};

export const useAppSettings = (onReset?: () => void) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // 从 localStorage 加载设置并注册快捷键
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        let loadedSettings = defaultSettings;

        if (saved) {
          loadedSettings = { ...defaultSettings, ...JSON.parse(saved) };
        }

        setSettings(loadedSettings);

        // 注册快捷键
        if (onReset && loadedSettings.resetShortcut) {
          await registerResetShortcut(loadedSettings.resetShortcut, onReset);
        }
      } catch (error) {
        console.error("加载设置失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();

    // 组件卸载时清理
    return () => {
      unregisterResetShortcut();
    };
  }, [onReset]);

  // 保存设置
  const saveSettings = async (newSettings: AppSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);

      // 如果快捷键改变了，重新注册
      if (newSettings.resetShortcut !== settings.resetShortcut && onReset) {
        await registerResetShortcut(newSettings.resetShortcut, onReset);
      }
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  };

  return {
    settings,
    saveSettings,
    isLoading,
  };
};
