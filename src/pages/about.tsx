import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Github, Minus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/window-frame";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cancelDestroyWindow, destroyWindow } from "@/lib/window";
import { useManualUpdateCheck } from "@/components/updater-dialog";
import packageJson from "../../package.json";

const techVersions = {
  tauri: packageJson.dependencies["@tauri-apps/api"].replace(/^\^/, "v"),
  react: packageJson.dependencies.react.replace(/^\^/, "v"),
  typescript: packageJson.devDependencies.typescript.replace(/^~/, "v"),
};

function AboutTitleBar({ title }: { title: string }) {
  const handleMinimize = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.minimize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  return (
    <div className="drag-region text-card-foreground relative z-20 flex h-12 shrink-0 items-center justify-between bg-background/90 px-4 select-none">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/images/aion2/aion2.png" alt="AION2" className="h-6 w-auto shrink-0 object-contain" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-white/92">{title}</span>
          <span className="truncate text-[11px] text-white/48">About</span>
        </div>
      </div>

      <div className="no-drag-region flex items-center gap-2">
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

export default function AboutPage() {
  const [appVersion, setAppVersion] = useState("");
  const { t } = useAppTranslation();
  const { checkUpdate, checking, showNoUpdate } = useManualUpdateCheck();

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      console.log("About window close requested, will destroy in 5 seconds");
      await destroyWindow(appWindow.label, 5000);
    });

    const unlistenFocusChanged = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        cancelDestroyWindow(appWindow.label);
      }
    });

    return () => {
      unlistenClose.then((fn) => fn());
      unlistenFocusChanged.then((fn) => fn());
    };
  }, []);

  const handleOpenGithub = async () => {
    await openUrl("https://github.com/kitlib/tauri-app-template");
  };

  return (
    <WindowFrame
      titleBar={<AboutTitleBar title={t("about.title")} />}
      contentClassName="flex flex-1 items-center justify-center overflow-hidden"
    >
      <div className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{t("about.appName")}</h2>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("about.version")}</span>
            <span className="font-medium">{appVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tauri</span>
            <span className="font-medium">{techVersions.tauri}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">React</span>
            <span className="font-medium">{techVersions.react}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">TypeScript</span>
            <span className="font-medium">{techVersions.typescript}</span>
          </div>
        </div>

        <Button onClick={handleOpenGithub} className="w-full" variant="outline">
          <Github className="mr-2 h-4 w-4" />
          {t("about.github")}
        </Button>

        <Button onClick={checkUpdate} className="w-full" variant="outline" disabled={checking}>
          <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? t("updater.checking") : t("updater.checkForUpdates")}
        </Button>

        {showNoUpdate && (
          <p className="text-muted-foreground text-center text-sm">{t("updater.upToDate")}</p>
        )}
      </div>
    </WindowFrame>
  );
}
