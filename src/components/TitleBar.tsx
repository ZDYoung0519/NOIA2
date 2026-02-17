"use client";

import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Minus, Square, X } from "lucide-react";
import { ModeToggle } from "./ModeToggle";

export default function TitleBar() {
  const [open, setOpen] = useState(false);

  // 退出相关
  const appWindow = getCurrentWindow();
  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  const handleClose = () => setOpen(true);
  const handleGoBack = () => {
    window.history.back();
  };
  const handleRefresh = () => location.reload();

  return (
    <>
      <div
        style={
          {
            height: "40px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            WebkitUserSelect: "none",
            userSelect: "none",
            zIndex: 1000,
            WebkitAppRegion: "drag",
          } as any
        }
        className="bg-background"
      >
        {/* 左侧：返回 + 刷新 */}
        <div
          className="pl-5"
          style={
            { display: "flex", gap: "6px", WebkitAppRegion: "no-drag" } as any
          }
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoBack}
            className="cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* 右侧：主题切换 + 最小化、最大化、关闭 */}
        <div
          style={
            { display: "flex", gap: "6px", WebkitAppRegion: "no-drag" } as any
          }
        >
          <ModeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMinimize}
            className="cursor-pointer"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMaximize}
            className="cursor-pointer"
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="cursor-pointer" // 修复拼写错误：pointor → pointer
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 退出确认弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>退出应用</DialogTitle>
            <DialogDescription>
              关闭后应用将完全退出，确认操作？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false);
                appWindow.minimize(); // 直接调用
              }}
            >
              最小化
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                appWindow.close();
                setOpen(false);
                await invoke("exit_app");
              }}
            >
              退出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
