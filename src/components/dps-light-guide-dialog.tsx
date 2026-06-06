import { useState } from "react";

import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DPS_GUIDE_STEPS = [
  {
    image: "/guide1.png",
    alt: "Npcap 安装说明",
  },
  {
    image: "/guide2.png",
    alt: "角色识别说明",
  },
  {
    image: "/guide3.png",
    alt: "战斗数据显示说明",
  },
  {
    image: null,
    alt: "常见问题",
  },
] as const;

type DpsLightGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DpsLightGuideDialog({ open, onOpenChange }: DpsLightGuideDialogProps) {
  const [guideStep, setGuideStep] = useState(0);
  const [npcapOk, setNpcapOk] = useState<boolean | null>(null);
  const currentGuideStep = DPS_GUIDE_STEPS[guideStep];

  const checkNpcap = async () => {
    try {
      setNpcapOk(await invoke<boolean>("check_npcap_available"));
    } catch {
      setNpcapOk(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) {
      setGuideStep(0);
      void checkNpcap();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-background/95 max-h-[90vh] max-w-4xl overflow-hidden border-white/10 text-white backdrop-blur-sm sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>DPS 水表 - 使用指南</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm leading-relaxed text-white/70">
          {guideStep === 0 && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-slate-500">1.</span>
              <div className="flex-1">
                安装{" "}
                <a
                  href="https://npcap.com/dist/npcap-1.87.exe"
                  target="_blank"
                  rel="noreferrer"
                  className="cursor-pointer underline hover:text-white"
                  onClick={(event) => {
                    event.preventDefault();
                    void import("@tauri-apps/plugin-opener").then((module) =>
                      module.openUrl("https://npcap.com/dist/npcap-1.87.exe")
                    );
                  }}
                >
                  Npcap
                </a>
                （默认勾选第三个选项）
                <button
                  type="button"
                  onClick={() => {
                    void checkNpcap();
                  }}
                  className="ml-2 rounded border border-white/10 px-1.5 py-0.5 text-xs text-white/50 hover:text-white"
                >
                  重新检测
                </button>
              </div>
              <span
                className={
                  npcapOk === true
                    ? "mt-0.5 shrink-0 text-emerald-400"
                    : npcapOk === false
                      ? "mt-0.5 shrink-0 text-rose-400"
                      : "mt-0.5 shrink-0 text-slate-500"
                }
              >
                {npcapOk === true ? "已安装 ✓" : npcapOk === false ? "未安装 ×" : "检测中..."}
              </span>
            </div>
          )}

          {guideStep === 1 && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-slate-500">2.</span>
              <span>在游戏中传送一次，以便正确识别自己的角色。</span>
            </div>
          )}

          {guideStep === 2 && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-slate-500">3.</span>
              <span>进行打桩或副本战斗后，数据会自动显示。</span>
            </div>
          )}

          {guideStep === 3 && (
            <div className="space-y-3">
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="font-medium text-white/90">wifi 图标没有延迟？</div>
                <div>
                  请确保你已经下载了 Npcap，并勾选了第三个选项。如果仍然没有，属于加速器不支持。
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="font-medium text-white/90">为什么打桩没数据？</div>
                <div>请确保你已经下载了 Npcap，并且传送识别到了自己的角色。</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="font-medium text-white/90">
                  为什么副本中显示未知，或者多个角色？
                </div>
                <div>
                  因为你离队友太远，召唤物统计不到，对你自己没有影响。自己是召唤职业也不影响。收费水表默认不统计这些数据，而本软件为了保持严谨都公开显示。
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="font-medium text-white/90">其它问题</div>
                <div>下载最新安装包，重新安装时先卸载，并清空所有数据。</div>
              </div>
            </div>
          )}

          {currentGuideStep.image && (
            <img
              src={currentGuideStep.image}
              alt={currentGuideStep.alt}
              className={`mx-auto w-full rounded-md border border-white/10 object-contain ${
                guideStep === 0 ? "max-h-[52vh]" : "max-h-[62vh]"
              }`}
            />
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="text-xs text-white/45">
            {guideStep + 1} / {DPS_GUIDE_STEPS.length}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={guideStep === 0}
              onClick={() => setGuideStep((step) => Math.max(0, step - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              disabled={guideStep >= DPS_GUIDE_STEPS.length - 1}
              onClick={() =>
                setGuideStep((step) => Math.min(DPS_GUIDE_STEPS.length - 1, step + 1))
              }
            >
              下一页
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              我已知晓
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
