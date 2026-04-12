import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowFrame } from "@/components/window-frame";
import { MainTitleBar } from "@/components/main-title-bar";
import { UpdaterDialog } from "@/components/updater-dialog";
import { registerShortcut } from "@/lib/shortcut";
import { toggleWindow, createWindow } from "@/lib/window";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useAppSettings } from "@/hooks/use-app-settings";

export default function HomePage() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
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

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleOpenDps = async () => {
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
  };

  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      contentClassName="container mx-auto flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden p-8"
    >
      <UpdaterDialog />

      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight">{t("app.welcome")}</h1>
        <p className="text-muted-foreground">{t("app.description")}</p>
      </div>

      <div className="flex items-center gap-8">
        <a
          href="https://github.com/ZDYoung0519/NOIA2"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
        >
          <img src="icon.png" className="h-50 w-50" alt="Vite logo" />
        </a>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("greet.title")}</CardTitle>
          <CardDescription>{t("greet.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void greet();
            }}
          >
            <Input
              id="greet-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={t("greet.placeholder")}
              className="flex-1"
            />
            <Button type="submit">{t("greet.button")}</Button>
          </form>
          {greetMsg && <p className="bg-muted mt-4 rounded-md p-3 text-sm">{greetMsg}</p>}
        </CardContent>
      </Card>

      <Button onClick={handleOpenDps}>{t("app.openDps")}</Button>

      <div className="text-muted-foreground flex flex-wrap justify-center gap-4 text-sm">
        <span>React 19</span>
        <span>•</span>
        <span>TypeScript</span>
        <span>•</span>
        <span>Tailwind CSS v4</span>
        <span>•</span>
        <span>shadcn/ui</span>
        <span>•</span>
        <span>Tauri v2</span>
      </div>
    </WindowFrame>
  );
}
