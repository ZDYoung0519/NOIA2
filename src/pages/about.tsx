import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { X } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function AboutPage() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    appWindow.isMaximized().then(setIsMaximized);

    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleClose = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="tauri-ui-theme">
      <div
        className={cn(
          "h-screen w-screen flex flex-col bg-background",
          isMaximized ? "" : "rounded-md border border-border"
        )}
      >
        {/* 标题栏 */}
        <div className="h-8 flex items-center justify-between select-none bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
          <div
            data-tauri-drag-region
            className="flex-grow flex items-center pl-2"
          >
            <span className="text-sm font-medium">关于</span>
          </div>
          <button
            onClick={handleClose}
            className="title-bar-control hover:bg-destructive hover:text-destructive-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <main className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Tauri App Template</CardTitle>
              <CardDescription>现代化桌面应用开发模板</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">版本</span>
                  <span className="font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tauri</span>
                  <span className="font-medium">v2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">React</span>
                  <span className="font-medium">19</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TypeScript</span>
                  <span className="font-medium">5.8</span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-center text-muted-foreground">
                  基于 Tauri v2 + React 19 + TypeScript + shadcn/ui
                </p>
              </div>

              <Button onClick={handleClose} className="w-full" variant="outline">
                关闭
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    </ThemeProvider>
  );
}
