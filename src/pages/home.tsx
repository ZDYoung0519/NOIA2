import { useState, useEffect } from "react";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import tauriLogo from "../assets/tauri.svg";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowFrame } from "@/components/window-frame";
import { MainTitleBar } from "@/components/main-title-bar";
import { UpdaterDialog } from "@/components/updater-dialog";
import { listen } from "@tauri-apps/api/event";
import { registerShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { createWindow } from "@/lib/window";
import { useAppSettings } from "@/hooks/use-app-settings";

export default function HomePage() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const { t } = useAppTranslation();
  const { settings, saveSettings } = useAppSettings();

  useEffect(() => {
    const unlistenShortcutChanged = listen<{ shortcut: string }>(
      "shortcut-changed",
      async (event) => {
        console.log("Shortcut changed event received:", event.payload.shortcut);
        const newShortcut = event.payload.shortcut;
        await saveSettings({ shortcut: newShortcut });
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
    initTrayMenu();

    const initShortcut = async () => {
      if (settings.shortcut) {
        console.log("Registering saved shortcut:", settings.shortcut);
        await registerShortcut(settings.shortcut, async () => {
          await toggleWindow("main");
        });
      }
    };
    initShortcut();

    return () => {
      unlistenShortcutChanged.then((fn) => fn());
    };
  }, [saveSettings, settings.shortcut, t]);

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleOpenDps = async () => {
    await createWindow("dps", {
      title: t("dps.title"),
      url: "/dps",
      width: 500,
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
          href="https://vite.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
        >
          <img src={viteLogo} className="h-24 w-24" alt="Vite logo" />
        </a>
        <a
          href="https://tauri.app"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
        >
          <img src={tauriLogo} className="h-24 w-24" alt="Tauri logo" />
        </a>
        <a
          href="https://react.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
        >
          <img src={reactLogo} className="h-24 w-24" alt="React logo" />
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
              greet();
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

      <Button onClick={handleOpenDps}>打开DPS水表</Button>

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
