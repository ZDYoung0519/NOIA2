import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, FileText, Plus } from "lucide-react";

import BattleTargetDpsChart from "@/components/battle-target-dps-chart";
import CharacterCardCarousel from "@/components/character-card-carousel";
import { DpsLightGuideDialog } from "@/components/dps-light-guide-dialog";
import RecentTeammatesCard from "@/components/recent-teammates-card";

import { toast } from "sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { createDpsV2Window, createDpsWindow } from "@/lib/window";
import type { MainActorRecord } from "@/types/aion2dps";

export default function HomePage() {
  const [mainCharacter, setMainCharacter] = useState<MainActorRecord | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [showLightDialog, setShowLightDialog] = useState(false);
  const { t } = useAppTranslation();
  const navigate = useNavigate();

  // const handleLightDps = async () => {
  //   await createDpsNewWindow(true);
  //   toast.info("轻量水表已经启动！");
  //   setShowLightDialog(true);
  // };

  const quickActions = [
    // { label: "DPS水表(新版)", icon: Plus, onClick: handleLightDps },
    {
      label: "DPS水表(V2)",
      icon: Plus,
      onClick: async () => {
        await createDpsV2Window(true);
        toast.info("DPS V2 已启动！");
      },
    },
    {
      label: "DPS水表(旧版)",
      icon: Plus,
      onClick: () => {
        createDpsWindow(true);
        toast.info("水表已经启动，请切换至游戏窗口查看！");
      },
    },

    {
      label: t("home.actions.characterRating"),
      icon: ArrowUp,
      onClick: () => navigate("/character/search"),
    },
    { label: t("home.actions.rankings"), icon: ArrowUp, onClick: () => navigate("/dps-rank") },
    {
      label: t("home.actions.comingSoon"),
      icon: FileText,
      onClick: () => navigate("/history-battle-query"),
    },
  ];

  return (
    <div className="mx-auto max-w-[2500px] pt-5 pr-5 pl-5">
      <div className="space-y-8">
        <section className="grid gap-x-8 gap-y-8 xl:grid-cols-[1.16fr_0.6fr_0.56fr]">
          <div className="min-w-0">
            <CharacterCardCarousel onActiveCharacterChange={setMainCharacter} />
          </div>
          <RecentTeammatesCard mainCharacter={mainCharacter} />
          <div className="min-w-0 pt-1">
            <h3 className="text-foreground mb-6 text-[18px] font-semibold md:text-[20px]">
              {t("home.quickActions")}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className="border/50 bg-card text-foreground hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col items-center gap-3 rounded-[22px] border px-3 py-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    onClick={item.onClick}
                  >
                    <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <BattleTargetDpsChart
            mainCharacter={mainCharacter}
            selectedTargetKey={selectedTargetKey}
            onSelectTargetKey={setSelectedTargetKey}
          />
        </section>
      </div>

      <DpsLightGuideDialog open={showLightDialog} onOpenChange={setShowLightDialog} />
    </div>
  );
}
