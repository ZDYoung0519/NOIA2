import { check } from "@tauri-apps/plugin-updater";

import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  Package,
  ExternalLink,
  Copy,
  MessageCircle,
  Check,
} from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";

type UpdateStatus = "idle" | "downloading" | "installing" | "completed";

interface PlatformDownload {
  name: string;
  url: string;
  icon: string;
}

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [platforms, setPlatforms] = useState<PlatformDownload[]>([]);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const QQ_GROUP_URL = "https://qm.qq.com/q/oZf2hosIkU";

  const checkUpdate = async () => {
    try {
      const update = await check();
      if (update) {
        setUpdateInfo(update);

        const rawPlatforms = update.rawJson?.platforms || {};
        const parsedPlatforms: PlatformDownload[] = [];

        Object.entries(rawPlatforms).forEach(([key, value]: [string, any]) => {
          const platformMap: Record<string, string> = {
            "windows-x86_64": "Windows 64位",
            "windows-i686": "Windows 32位",
            "windows-aarch64": "Windows ARM",
            "darwin-x86_64": "macOS Intel",
            "darwin-aarch64": "macOS Apple Silicon",
            "linux-x86_64": "Linux 64位",
          };

          if (value.url) {
            parsedPlatforms.push({
              name: platformMap[key] || key,
              url: value.url.trim(),
              icon: getPlatformIcon(key),
            });
          }
        });

        setPlatforms(parsedPlatforms);
        setShowDialog(true);
      } else {
        toast.info("当前已是最新版本");
      }
    } catch (e) {
      toast.error("检查更新失败");
    }
  };

  const getPlatformIcon = (platform: string) => {
    if (platform.includes("windows")) return "🪟";
    if (platform.includes("darwin")) return "🍎";
    if (platform.includes("linux")) return "🐧";
    return "💻";
  };

  const handleInstall = async () => {
    if (!updateInfo) return;
    const update = await check();
    if (!update) return;

    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength || 0;
          setStatus("downloading");
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          const percent = contentLength
            ? Math.round((downloaded / contentLength) * 100)
            : 0;
          setProgress(percent);
          break;
        case "Finished":
          setProgress(100);
          setStatus("installing");
          break;
      }
    });

    setStatus("completed");
    toast.success("更新完成，即将重启...");
    await relaunch();
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success("链接已复制");
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const getStatusUI = () => {
    switch (status) {
      case "downloading":
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                正在下载... {progress}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        );
      case "installing":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 animate-bounce" />
              <span>正在安装更新...</span>
            </div>
            <Progress value={100} className="h-2" />
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>安装完成，正在重启...</span>
          </div>
        );
      default:
        return null;
    }
  };

  return {
    checkUpdate,
    UpdateDialog: (
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发现新版本 {updateInfo?.version}</DialogTitle>
            <DialogDescription>
              {updateInfo?.date &&
                new Date(updateInfo.date).toLocaleDateString("zh-CN")}
            </DialogDescription>
          </DialogHeader>

          {/* QQ 群二维码 */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <MessageCircle className="h-5 w-5" />
              <span>推荐：扫码加入 QQ 群</span>
            </div>
            <div className="flex justify-center">
              <img
                src="/images/qgroup_code.jpg"
                alt="QQ群二维码"
                className="w-40 h-40 object-cover rounded-md border"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              群内提供更快的下载速度和技术支持
            </p>
            <Button
              variant="outline"
              onClick={() => openUrl(QQ_GROUP_URL)}
              className="w-full gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              点击加入 QQ 群
            </Button>
          </div>

          {/* 更新内容 */}
          {updateInfo?.body && (
            <div className="text-sm">
              <div className="font-medium mb-1">更新内容</div>
              <div className="text-muted-foreground whitespace-pre-wrap">
                {updateInfo.body}
              </div>
            </div>
          )}

          {/* 下载链接 */}
          <div className="space-y-2">
            <div className="text-sm font-medium">下载链接</div>
            {platforms.map((platform) => (
              <div
                key={platform.name}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span>{platform.icon}</span>
                  <span>{platform.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyUrl(platform.url)}
                  >
                    {copiedUrl === platform.url ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openUrl(platform.url)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* 操作区 */}
          {status !== "idle" ? (
            <div className="py-2">{getStatusUI()}</div>
          ) : (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                暂不更新
              </Button>
              {platforms.length > 0 && (
                <Button onClick={handleInstall} className="gap-2">
                  <Download className="h-4 w-4" />
                  自动更新
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    ),
  };
}
