import { Button } from "@/components/ui/button";
import { Trash2, Star, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BuildDataProps, CharacterProps } from "@/types/aion2";
import {
  renderEquipSlotSmall,
  EquipTooltip,
} from "@/components/aion2/SlotEquipment";
import { renderSkillSlot } from "@/components/aion2/SlotSkill";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/aion2/custom-tooltip";

export function BuildCard({
  rank,
  buildData,
  onClick,
  onDelete,
}: {
  rank: number;
  buildData: BuildDataProps | CharacterProps;
  isLocal: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}) {
  /* -------------- 占位 -------------- */

  // 类型守卫函数
  function isBuildDataProps(
    buildData: BuildDataProps | CharacterProps,
  ): buildData is BuildDataProps {
    return "buildName" in (buildData as any).profile;
  }

  let displayName: string;
  if (isBuildDataProps(buildData)) {
    displayName = buildData.profile.buildName;
  } else {
    displayName = `${buildData.profile.characterName} [${buildData.profile.serverName}]`;
  }

  let buildId: string;
  if (isBuildDataProps(buildData)) {
    buildId = buildData.id;
  } else {
    buildId = buildData.characterId;
  }

  debugger;
  const showSkillNums = 4;

  const equipment = buildData.info.equipmentList;
  const skillList = buildData?.info?.skillList;
  const ActiveSkillList = skillList
    .filter((s) => s.category === "Active")
    .sort((a, b) => b.skillLevel - a.skillLevel)
    .slice(0, showSkillNums);

  const PassiveSkillList = skillList
    .filter((s) => s.category === "Passive")
    .sort((a, b) => b.skillLevel - a.skillLevel)
    .slice(0, showSkillNums);

  const DpSkillList = skillList
    .filter((s) => s.category === "Dp")
    .sort((a, b) => b.skillLevel - a.skillLevel)
    .slice(0, showSkillNums);

  const rating = 4.5;
  const tags = ["爆发", "PVE", "nbclass"];

  const classIconMap = {
    殺星: "/images/class/assassin.webp",
    劍星: "/images/class/gladiator.webp",
    護法星: "/images/class/chanter.webp",
    治愈星: "/images/class/cleric.webp",
    守護星: "/images/class/templar.webp",
    魔道星: "/images/class/sorcerer.webp",
    精靈星: "/images/class/elementalist.webp",
    弓星: "/images/class/ranger.webp",
  };

  const icon =
    classIconMap[buildData.profile.className as keyof typeof classIconMap];
  debugger;

  return (
    <Card
      className="relative hover:shadow-md transition-shadow cursor-pointer hover:brightness-135 hover:border-blue-500"
      onClick={onClick ? () => onClick() : undefined}
    >
      {onDelete && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive z-10"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(buildId);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}

      <CardContent className="p-1 pl-5 pr-5">
        <div className="flex items-stretch gap-4 h-full">
          {/* -------- 第 1 列：职业图标 -------- */}
          <div className="shrink-0 flex items-center text-lg">#{rank}.</div>
          <div className="shrink-0 flex items-center">
            <img
              src={icon}
              alt={buildData.profile.className}
              width="56"
              height="56"
              className=""
            />
          </div>

          {/* -------- 第 2 列：名称 + 评分 + tags/time -------- */}
          <div className="shrink-0 w-50 flex flex-col justify-center gap-2">
            <div className="font-semibold text-base mb-1">{displayName}</div>
            {/* tags & 时间 */}
            <div className="flex items-center text-xs text-muted-foreground space-x-2">
              {tags.map((t) => (
                <span key={t} className="px-2 bg-secondary rounded">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">燃烧的浅蓝</span>
              <span className="text-xs text-muted-foreground">
                {new Date(buildData.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* -------- 中间区域：装备（左）+ 技能（右）两列布局，整体居中 -------- */}
          <TooltipProvider delayDuration={0} skipDelayDuration={100}>
            <div className="flex-1 flex items-center justify-center gap-6">
              {/* 左侧：装备区域 - 两行 */}
              <div className="flex flex-col gap-2">
                {[0, 1].map((row) => (
                  <div key={row} className="flex justify-center gap-2">
                    {equipment
                      .filter((_, idx) => idx % 2 === row)
                      .map((eq) => (
                        <Tooltip key={eq.slotPos}>
                          <TooltipTrigger asChild>
                            {renderEquipSlotSmall({ eq: eq, size: 10 })}
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            className="p-0 rounded-none"
                          >
                            <EquipTooltip eq={eq} />
                          </TooltipContent>
                        </Tooltip>
                      ))}
                  </div>
                ))}
              </div>

              {/* 右侧：技能区域 - 三行 */}
              <div className="flex flex-col gap-2">
                {/* 主动技能 */}
                <div className="grid grid-cols-4 gap-2">
                  {ActiveSkillList.map((skill) => (
                    <div key={skill.name} className="flex justify-center">
                      {renderSkillSlot({
                        skill: skill,
                        scaleFactor: 0.6,
                      })}
                    </div>
                  ))}
                </div>

                {/* 被动技能 */}
                <div className="grid grid-cols-4 gap-2">
                  {PassiveSkillList.map((skill) => (
                    <div key={skill.name} className="flex justify-center">
                      {renderSkillSlot({
                        skill: skill,
                        scaleFactor: 0.6,
                      })}
                    </div>
                  ))}
                </div>

                {/* DP技能 */}
                <div className="grid grid-cols-4 gap-2">
                  {DpSkillList.map((skill) => (
                    <div key={skill.name} className="flex justify-center">
                      {renderSkillSlot({
                        skill: skill,
                        scaleFactor: 0.6,
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TooltipProvider>

          {/* -------- 第 4 列：等级 & 评分 & 作者（靠右对齐）-------- */}
          <div className="shrink-0 flex flex-col justify-center self-stretch text-right min-w-[180px]">
            <div className="grid grid-cols-2 gap-0">
              <div>
                <div className="text-xl font-bold mt-2">
                  {buildData.scores.damageTotal?.toFixed(0) || "--"}
                </div>
                <div className="text-xs text-muted-foreground">总攻击力</div>
              </div>
              <div>
                <div className="text-xl font-bold mt-2">
                  {buildData.scores.ItemLevel?.toFixed(0) || "--"}
                </div>
                <div className="text-xs text-muted-foreground">道具等级</div>
              </div>

              <div>
                <div className="text-xl font-bold mt-2">
                  {buildData.scores.FengwoScore?.toFixed(0) || "--"}
                </div>
                <div className="text-xs text-muted-foreground">蜂窝评分</div>
              </div>
              <div>
                <div className="text-xl font-bold mt-2">
                  {buildData.scores.PvEScore?.toFixed(0) || "--"}
                </div>
                <div className="text-xs text-muted-foreground">综合评分</div>
              </div>
            </div>

            {/* 作者 - 靠右对齐 */}
            {/* 星级 */}
            <div className=" flex items-center justify-end gap-2 mt-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < Math.floor(rating)
                      ? "text-yellow-400 fill-current"
                      : "text-gray-300"
                  }`}
                />
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                {rating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BuildCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}
