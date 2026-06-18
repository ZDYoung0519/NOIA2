import { useState, useEffect } from "react";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import tauriLogo from "../assets/tauri.svg";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UpdaterDialog } from "@/components/updater-dialog";
import { useAppTranslation } from "@/hooks/use-app-translation";

export default function HomePage() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const { t } = useAppTranslation();

  useEffect(() => {
    // Initialize tray menu with current language
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

    return () => {};
  }, [t]);

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  async function openDpsOverlay() {
    try {
      await invoke("create_dps_overlay");
    } catch (error) {
      console.error("Failed to create DPS overlay:", error);
    }
  }

  return (
    <div className="container mx-auto flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden p-8">
      <UpdaterDialog />
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight">{t("app.welcome")}</h1>
        <p className="text-muted-foreground">{t("app.description")}</p>
      </div>

      <Button variant="outline" onClick={openDpsOverlay}>
        {t("dpsOverlay.open")}
      </Button>

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
    </div>
  );
}
