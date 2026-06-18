import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Github, RefreshCw, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import packageJson from "../../package.json";

import { useManualUpdateCheck } from "@/components/updater-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsGroup, SettingsRow, SettingsSectionHeader } from "@/components/settings-layout";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { formatStorageSize, getLocalStorageSummary } from "@/lib/storage-summary";
import { unregisterAllShortcut } from "@/lib/shortcut";

const TECH_VERSIONS = [
  {
    name: "Tauri",
    version: packageJson.dependencies["@tauri-apps/api"].replace(/^\^/, "v"),
  },
  {
    name: "React",
    version: packageJson.dependencies.react.replace(/^\^/, "v"),
  },
  {
    name: "TypeScript",
    version: packageJson.devDependencies.typescript.replace(/^~/, "v"),
  },
  {
    name: "Vite",
    version: packageJson.devDependencies.vite.replace(/^\^/, "v"),
  },
];

export function AboutSettings() {
  const [appVersion, setAppVersion] = useState("");
  const [clearStorageOpen, setClearStorageOpen] = useState(false);
  const [storageSummary, setStorageSummary] = useState(() => getLocalStorageSummary());
  const { t } = useAppTranslation();
  const { checkUpdate, checking, showNoUpdate } = useManualUpdateCheck();

  const refreshStorageSummary = useCallback(() => {
    setStorageSummary(getLocalStorageSummary());
  }, []);

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    refreshStorageSummary();

    const handleFocus = () => refreshStorageSummary();
    const handleStorage = () => refreshStorageSummary();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshStorageSummary]);

  const handleOpenGithub = useCallback(() => {
    void openUrl("https://github.com/ZDYoung0519/NOIA2");
  }, []);

  const handleClearStorage = useCallback(async () => {
    try {
      await unregisterAllShortcut();
    } catch (error) {
      console.error("Failed to unregister global shortcuts before clearing cache:", error);
    }

    localStorage.clear();
    setClearStorageOpen(false);
    refreshStorageSummary();
    window.location.reload();
  }, [refreshStorageSummary]);

  return (
    <div className="flex flex-col gap-8">
      <SettingsSectionHeader
        title="关于"
        description="查看应用版本、技术栈、更新状态和本地缓存占用。"
      />

      <SettingsGroup title="应用信息">
        <SettingsRow
          label={t("about.appName")}
          description={t("about.description")}
          control={null}
        />
        <SettingsRow
          label={t("about.version")}
          description={showNoUpdate ? t("updater.upToDate") : undefined}
          control={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{appVersion || "-"}</span>
              <Button variant="outline" size="sm" onClick={checkUpdate} disabled={checking}>
                <RefreshCw
                  data-icon="inline-start"
                  className={checking ? "animate-spin" : undefined}
                />
                {checking ? t("updater.checking") : t("updater.checkForUpdates")}
              </Button>
              {showNoUpdate ? <Badge variant="secondary">{t("updater.upToDate")}</Badge> : null}
            </div>
          }
        />
        {TECH_VERSIONS.map((item) => (
          <SettingsRow
            key={item.name}
            label={item.name}
            control={<span className="text-sm font-medium">{item.version}</span>}
          />
        ))}
        <SettingsRow
          label="GitHub"
          control={
            <Button variant="outline" size="sm" onClick={handleOpenGithub}>
              <Github data-icon="inline-start" />
              GitHub
            </Button>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="本地缓存">
        <SettingsRow
          label="当前占用"
          description="应用设置、搜索历史和运行时数据会保存在本机。"
          control={
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {formatStorageSize(storageSummary.totalBytes)}
              </span>
              <Button variant="outline" size="sm" onClick={refreshStorageSummary}>
                <RefreshCw data-icon="inline-start" />
                刷新
              </Button>
            </div>
          }
        />

        <SettingsRow
          label="清理缓存"
          description="清理本地保存的设置、搜索历史和缓存数据，并重新加载窗口。"
          control={
            <Button variant="destructive" size="sm" onClick={() => setClearStorageOpen(true)}>
              <Trash2 data-icon="inline-start" />
              清理并重启
            </Button>
          }
        />

        {storageSummary.entries.length === 0 ? (
          <div className="text-muted-foreground px-5 py-6 text-sm">暂无本地缓存数据。</div>
        ) : (
          storageSummary.entries.map((entry) => (
            <SettingsRow
              key={entry.key}
              label={entry.key}
              description={`${entry.bytes.toLocaleString()} bytes`}
              control={
                <span className="text-sm font-medium">{formatStorageSize(entry.bytes)}</span>
              }
            />
          ))
        )}
      </SettingsGroup>

      <Dialog open={clearStorageOpen} onOpenChange={setClearStorageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>清理本地缓存？</DialogTitle>
            <DialogDescription>
              这会清空本机保存的设置、搜索历史和缓存数据，并重新加载应用窗口。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearStorageOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleClearStorage();
              }}
            >
              清理并重启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
