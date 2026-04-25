import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "../custom-tooltip";

import { gradeConfig, GradeType } from "./common";

export function ArcanaTooltip({ eq }: { eq: any }) {
  const info = eq.detail as {
    mainStats: [];
    subSkills: [];
    set: {
      name: string;
      equippedCount: number;
      bonuses: { descriptions: []; degree: number }[];
    };
  };
  const grade = eq.detail.grade as GradeType;
  const cfg = gradeConfig[grade];
  const textClass = gradeConfig[grade]?.text;

  const isEffectValue = (s: string) => {
    return Number(String(s ?? "").replace("%", "")) != 0;
  };

  return (
    <div className="z-100 w-90">
      <div
        className={`relative flex items-start justify-between rounded-none border-2 bg-cover bg-center p-3 ${cfg.bgDark} ${cfg.border} transition hover:border-orange-500 hover:brightness-110`}
        style={{ backgroundImage: cfg.bg }}
      >
        {/* 左侧信息：左上对齐 */}
        <div className="z-10 flex flex-col items-start gap-1">
          <div className={`font-semibold ${cfg.text} text-xl`}>
            +{eq.detail.enchantLevel} {eq.detail.name}
          </div>
          <div className="text-md">
            <span className={textClass}>{eq.detail.gradeName}</span>
            <span>{eq.detail.categoryName}</span>
          </div>

          <div className="text-md">道具等级{eq.detail.itemLevel}</div>
          <div className="text-md">
            {eq.detail.level}(+{eq.detail.level}){eq.detail.itemLevel}
          </div>
        </div>

        {/* 右侧：图片 + 槽位 */}
        <div className="z-10 flex flex-col items-end gap-0">
          {/* 装备图 */}
          <img
            src={eq.detail.icon}
            alt={eq.detail.name}
            className="h-25 w-25 rounded-md object-contain p-0 select-none"
          />
        </div>
      </div>
      {/* 主属性 */}
      <div className="space-y-2 p-3">
        {info?.mainStats?.map((s: any, idx: number) => (
          <div key={idx} className={`flex justify-between ${s.exceed ? "text-orange-500" : ""}`}>
            <span>{s.name}</span>
            {!s.exceed ? (
              <>
                {isEffectValue(s.minValue) ? `${s.minValue}~` : ""}
                {isEffectValue(s.value) ? `${s.value}` : ""}
                {isEffectValue(s.extra) ? `(+${s.extra})` : ""}
              </>
            ) : (
              <>{isEffectValue(s.extra) ? `+${s.extra}` : ""}</>
            )}
          </div>
        ))}
      </div>
      <Separator />
      {/* 技能属性 */}
      <div className="space-y-0 p-3">
        {info?.subSkills?.map((s: any, idx: number) => (
          <div key={idx} className={`flex justify-between text-blue-400`}>
            <span>{s.name}</span>
            <span>+{s.level}</span>
          </div>
        ))}
      </div>
      <Separator />

      {/* 套装属性 */}
      <div className="space-y-0 p-2">
        <div className="p-2 text-center font-bold">套装效果:{info.set.name}</div>
        {info?.set?.bonuses?.map((bonus, idx) => (
          <div key={idx}>
            {bonus.descriptions.map((desc, i) => (
              <div
                key={i}
                className={
                  info?.set?.equippedCount >= bonus.degree
                    ? "text-white-300 text-left"
                    : "text-left text-gray-500"
                }
              >
                [{bonus.degree}] {desc}
              </div>
            ))}
          </div>
        ))}
      </div>
      <Separator />
    </div>
  );
}

export function renderArcanaSlot({ eq }: { eq: any }) {
  const grade = eq.detail.grade as GradeType;
  const cfg = gradeConfig[grade];
  // const textClass = gradeConfig[grade]?.text;

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={`relative flex items-center rounded-xl bg-cover p-1 hover:brightness-130`}
          style={{ backgroundImage: cfg.bg, width: 125 }}
        >
          {/* 图标 */}
          <div className="relative overflow-hidden rounded-md">
            <img
              src={eq.detail.icon}
              alt={eq.detail.name}
              className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 scale-150 object-cover"
            />
            <img
              src="/images/aion2/arcana_decoration.webp"
              alt=""
              loading="eager"
              className="relative z-10 block h-full w-full"
            />
            <div className="border-grade-41 absolute inset-0 rounded-md border-[3px]" />
          </div>
        </div>
        <TooltipContent side="right" align="center" className="rounded-none p-0">
          <ArcanaTooltip eq={eq} />
        </TooltipContent>
      </TooltipTrigger>
    </Tooltip>
  );
}
