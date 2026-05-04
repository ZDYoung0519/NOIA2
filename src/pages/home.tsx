import { useState } from "react";
import { ArrowUp, FileText, Plus } from "lucide-react";

import BattleTargetDpsChart from "@/components/battle-target-dps-chart";
import CharacterCardCarousel from "@/components/character-card-carousel";
import RecentTeammatesCard from "@/components/recent-teammates-card";

import { useAppTranslation } from "@/hooks/use-app-translation";
import { createDpsWindow } from "@/lib/window";
import type { MainActorRecord } from "@/types/aion2dps";

export default function HomePage() {
  const [mainCharacter, setMainCharacter] = useState<MainActorRecord | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const { t } = useAppTranslation();

  const quickActions = [
    { label: t("home.actions.openDps"), icon: Plus, onClick: () => createDpsWindow(true) },
    { label: t("home.actions.characterRating"), icon: ArrowUp, onClick: () => {} },
    { label: t("home.actions.rankings"), icon: ArrowUp, onClick: () => {} },
    { label: t("home.actions.comingSoon"), icon: FileText, onClick: () => {} },
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
    </div>
  );
}
