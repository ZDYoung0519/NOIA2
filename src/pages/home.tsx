import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, MoreVertical, Search, Plus, ArrowUp, FileText } from "lucide-react";
// import BankCardCarousel from "@/components/bank-card-carousel";
import BattleTargetDpsChart from "@/components/battle-target-dps-chart";
import BattleTargetTransactions from "@/components/battle-target-transactions";
import CharacterCardCarousel from "@/components/character-card-carousel";
import RecentTeammatesCard from "@/components/recent-teammates-card";
import { useState } from "react";
import type { MainActorRecord } from "@/types/aion2dps";
import { createWindow } from "@/lib/window";

export default function HomePage() {
  const [mainCharacter, setMainCharacter] = useState<MainActorRecord | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);

  const handleOpenDps = async () => {
    await createWindow("dps", {
      title: "DPS Meter",
      url: "/dps",
      width: 200,
      height: 50,
      resizable: true,
      maximizable: false,
      minimizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
    });
  };

  const quickActions = [
    { label: "Dps水表", icon: Plus, onClick: handleOpenDps },
    { label: "角色评分", icon: ArrowUp, onClick: () => {} },
    { label: "1234", icon: ArrowUp, onClick: () => {} },
    { label: "1234", icon: FileText, onClick: () => {} },
  ];

  return (
    <div className="mx-auto max-w-[2500px] pr-5 pl-5">
      <div className="space-y-8">
        <header className="grid items-center gap-4 xl:grid-cols-[1.15fr_0.72fr_0.55fr]">
          <div className="relative w-full max-w-[290px]">
            <Search className="text-muted-foreground absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search"
              className="border-border/50 bg-muted/50 placeholder:text-muted-foreground focus-visible:ring-ring h-12 rounded-2xl pl-11 text-sm shadow-none focus-visible:ring-1"
            />
          </div>

          <div />

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
            {/* <Avatar className="h-11 w-11 ring-4 ring-background">
              <AvatarImage src="https://i.pravatar.cc/100?img=13" alt="User avatar" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar> */}
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-8 xl:grid-cols-[1.16fr_0.6fr_0.56fr]">
          <div className="min-w-0">
            <CharacterCardCarousel onActiveCharacterChange={setMainCharacter} />
          </div>

          <RecentTeammatesCard mainCharacter={mainCharacter} />

          <div className="min-w-0 pt-1">
            <h3 className="text-foreground mb-6 text-[18px] font-semibold md:text-[20px]">
              Quick actions
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

        <section className="grid gap-x-8 gap-y-8 xl:grid-cols-[1.02fr_1fr]">
          <BattleTargetTransactions
            mainCharacter={mainCharacter}
            selectedTargetKey={selectedTargetKey}
            onSelectTargetKey={setSelectedTargetKey}
          />

          <BattleTargetDpsChart
            mainCharacter={mainCharacter}
            selectedTargetKey={selectedTargetKey}
          />
        </section>
      </div>
    </div>
  );
}
