import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "./custom-tooltip";

import { gradeConfig, GradeType } from "./common";

export function ArcanaTooltip({ eq }: { eq: any }) {
  const info = eq.item_info as {
    mainStats: [];
    subSkills: [];
    set: {
      name: string;
      equippedCount: number;
      bonuses: { descriptions: []; degree: number }[];
    };
  };
  const grade = eq.grade as GradeType;
  const cfg = gradeConfig[grade];
  const textClass = gradeConfig[grade]?.text;

  const isEffectValue = (s: string) => {
    return Number(String(s ?? "").replace("%", "")) != 0;
  };

  return (
    <div className="w-90 z-100">
      <div
        className={`
        relative flex items-start justify-between
        bg-cover bg-center
        rounded-none border-2 p-3
        ${cfg.bgDark} ${cfg.border}
        hover:border-orange-500 hover:brightness-110
        transition 
      `}
        style={{ backgroundImage: cfg.bg }}
      >
        {/* 左侧信息：左上对齐 */}
        <div className="flex flex-col items-start gap-1 z-10">
          <div className={`font-semibold ${cfg.text} text-xl`}>
            +{eq.enchantLevel} {eq.name}
          </div>
          <div className="text-md">
            <span className={textClass}>{eq.item_info.gradeName}</span>
            <span>{eq.item_info.categoryName}</span>
          </div>

          <div className="text-md">道具等级{eq.itemLevel}</div>
          <div className="text-md">
            {eq.item_info.level}(+{eq.item_info.level}){eq.itemLevel}
          </div>
        </div>

        {/* 右侧：图片 + 槽位 */}
        <div className="flex flex-col items-end gap-0 z-10">
          {/* 装备图 */}
          <img
            src={eq.icon}
            alt={eq.name}
            className="w-25 h-25 rounded-md object-contain p-0 select-none"
          />
        </div>
      </div>
      {/* 主属性 */}
      <div className="p-3 space-y-2">
        {info?.mainStats?.map((s: any, idx: number) => (
          <div
            key={idx}
            className={`flex justify-between ${
              s.exceed ? "text-orange-500" : ""
            }`}
          >
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
      <div className="p-3 space-y-0">
        {info?.subSkills?.map((s: any, idx: number) => (
          <div key={idx} className={`flex justify-between text-blue-400`}>
            <span>{s.name}</span>
            <span>+{s.level}</span>
          </div>
        ))}
      </div>
      <Separator />

      {/* 套装属性 */}
      <div className="p-2  space-y-0">
        <div className="text-center font-bold p-2">
          套装效果:{info.set.name}
        </div>
        {info?.set?.bonuses?.map((bonus, idx) => (
          <div key={idx}>
            {bonus.descriptions.map((desc, i) => (
              <div
                key={i}
                className={
                  info?.set?.equippedCount >= bonus.degree
                    ? "text-white-300 text-left"
                    : "text-gray-500 text-left"
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
  const grade = eq.grade as GradeType;
  const cfg = gradeConfig[grade];
  // const textClass = gradeConfig[grade]?.text;

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={`relative flex items-center p-1 bg-cover hover:brightness-130  rounded-xl `}
          style={{ backgroundImage: cfg.bg, width: 125 }}
        >
          {/* 图标 */}
          <div className="relative overflow-hidden rounded-md">
            <img
              src={eq.icon}
              alt={eq.name}
              className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 scale-150 object-cover"
            />
            <img
              src="/images/aion2/arcana_decoration.webp"
              alt=""
              loading="eager"
              className="relative z-10 block w-full h-full"
            />
            <div className="absolute inset-0 rounded-md border-[3px] border-grade-41" />
          </div>
        </div>
        <TooltipContent
          side="right"
          align="center"
          className="p-0 rounded-none"
        >
          <ArcanaTooltip eq={eq} />
        </TooltipContent>
      </TooltipTrigger>
    </Tooltip>
  );
}
