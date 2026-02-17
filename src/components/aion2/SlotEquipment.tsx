import React from "react";

import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipProvider,
  TooltipContent,
} from "./custom-tooltip";

import { gradeConfig, GradeType } from "./common";

type RenderDiamondProps = {
  solid: boolean;
  value: string | null;
  w: number;
  h: number;
};

export const renderDiamond = ({ solid, value, w, h }: RenderDiamondProps) => {
  const scale = 0.75; // 内菱形占比，可调
  const fontSize = Math.min(w, h) * 0.75; // 字号随尺寸缩放

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: w, height: h }}
    >
      {/* 外层菱形 */}
      <div
        className="absolute inset-0 bg-teal-400"
        style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
      />

      {/* 空心时再加内层黑色菱形 */}
      {!solid && (
        <div
          className="absolute bg-black"
          style={{
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
          }}
        />
      )}

      {/* 数字（可选） */}
      {value && (
        <span
          className="relative text-white font-bold select-none text-lg"
          style={{ fontSize, lineHeight: 1 }}
        >
          {value}
        </span>
      )}
    </div>
  );
};

export function EquipTooltip({ eq }: { eq: any }) {
  const info = eq.item_info;
  // const icon = eq.icon;

  const cfg = gradeConfig[eq.grade as GradeType];
  // const textClass = gradeConfig[eq.grade as GradeType]?.text;

  const soulBindRate = Number(eq.item_info?.soulBindRate);
  const magicStoneStat = eq.item_info?.magicStoneStat;
  const godStoneStat = eq.item_info?.godStoneStat as {
    slotPos: number;
    desc: string;
    name: string;
    icon: string;
    grade: GradeType;
  }[];

  const isEffectValue = (s: string) => {
    return Number(String(s ?? "").replace("%", "")) != 0;
  };

  return (
    <div className="w-100">
      <div
        className={`
        relative flex items-start justify-between
        bg-cover bg-center
        rounded-none border-2 p-3
        ${cfg.bgDark} ${cfg.border}
        hover:border-orange-500 hover:brightness-110
        cursor-pointer transition z-100
      `}
        style={{ backgroundImage: cfg.bg }}
      >
        {/* 左侧信息：左上对齐 */}
        <div className="flex flex-col items-start gap-1 z-10">
          <div className={`font-semibold ${cfg.text} text-xl`}>
            +{eq.enchantLevel} {eq.name}
          </div>
          <div className="text-md">
            <span
              className={
                gradeConfig[(eq.item_info?.grade as GradeType) || "Common"]
                  ?.text
              }
            >
              {eq.item_info?.gradeName || "Common"}
            </span>
            <span>{eq.item_info?.categoryName || ""}</span>
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
          {/* 5 个菱形槽 */}
          <div className="grid grid-cols-5 gap-2" style={{ marginTop: "-6px" }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const solid = i < (eq.exceedLevel || 0);
              return (
                <React.Fragment key={i}>
                  {renderDiamond({
                    solid,
                    value: null, // 实心才显示数字（1~5）
                    w: 16,
                    h: 20,
                  })}
                </React.Fragment>
              );
            })}
          </div>
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
      {/* 灵魂刻印 */}
      {soulBindRate && (
        <>
          <Separator />
          <div className="p-3 space-y-2">
            <div className="flex justify-between">
              <span
                className={`tex${
                  soulBindRate === 100 ? "text-yellow-400" : "text-teal-400"
                }`}
              >
                灵魂刻印率
              </span>
              <span className="">{soulBindRate}%</span>
            </div>

            {/* 进度条容器 */}
            <div className="w-full h-1 bg-gray-700">
              <div
                className={`h-full ${
                  soulBindRate === 100 ? "bg-yellow-400" : "bg-teal-400"
                }`}
                style={{ width: `${soulBindRate}%` }}
              />
            </div>

            {info?.subStats?.length > 0 && (
              <>
                {info.subStats.map((s: any) => (
                  <div key={s.id} className="flex justify-between">
                    <span>{s.name}</span>
                    <span className="">{s.value}</span>
                  </div>
                ))}
              </>
            )}

            {info?.subSkills?.length > 0 && (
              <>
                {info.subSkills.map((s: any) => (
                  <div key={s.id} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <img
                        src={"/images/aion2/icon_skill.png"}
                        alt=""
                        className="w-4 h-4 select-none"
                      />
                      <span className="text-teal-400 underline">{s.name}</span>
                    </div>

                    <span className="text-sm">Lv.+{s.level}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <Separator />
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {magicStoneStat?.map((s: any, idx: number) => (
            <div
              key={`${s.id}-${idx}`}
              className={`flex items-center space-x-2 ${
                gradeConfig[s.grade as GradeType]?.text
              }`}
            >
              <img src={s.icon} alt="" className="w-10 h-10 select-none" />
              <span className="text-left">
                {s.name}
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* 神石：仅当数组里有数据才渲染 */}
      {godStoneStat?.length > 0 && (
        <div className="p-3 space-y-2">
          {godStoneStat.map((g) => (
            <div key={g.slotPos} className="flex items-start gap-2">
              <img src={g.icon} alt="" className="w-6 h-6 shrink-0" />
              <div className="flex-1">
                <div
                  className={`font-semibold ${
                    gradeConfig[g.grade as GradeType]?.text || ""
                  }`}
                >
                  {g.name}
                </div>
                {/* 把换行符替换成 <br /> 就能在 JSX 里正确换行 */}
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {g.desc.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      <br />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="p-2"></div>
    </div>
  );
}

export function renderEquipmentSlot({ eq }: { eq: any }) {
  const grade = eq.grade as GradeType;
  const cfg = gradeConfig[grade] || gradeConfig.Common;

  return (
    <div
      className={`
        relative flex items-center gap-1 px-2 border-2 h-12 max-w
        bg-cover bg-center
        ${cfg.bgDark} ${cfg.border} hover:border-teal-200 
        hover:brightness-130  transition
      `}
      style={{ backgroundImage: cfg.bg }} /* 整张卡片背景 */
    >
      {/* 图标 */}
      <img
        src={eq.icon}
        alt={eq.name}
        className="w-10 h-10 rounded-md object-contain"
      />
      {eq.exceedLevel > 0 ? (
        renderDiamond({
          solid: true,
          value: String(eq.exceedLevel),
          w: 16,
          h: 20,
        })
      ) : (
        <span className="w-8 h-14" style={{ marginLeft: "-20px" }} />
      )}

      {/* 名称 & 强化等级 */}
      <div className={`font-semibold ${cfg.text} select-none`}>
        +{eq.enchantLevel} {eq.name}
      </div>
    </div>
  );
}

export function renderEquipSlotWithTooltip({ eq }: { eq: any }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{renderEquipmentSlot({ eq: eq })}</TooltipTrigger>
      <TooltipContent side="right" align="start" className="p-0 rounded-none">
        <EquipTooltip eq={eq} />
      </TooltipContent>
    </Tooltip>
  );
}

export function renderEquipSlotSmall({
  eq,
  size = 15,
}: {
  eq: Record<string, any>;
  size: Number;
}) {
  const cfg = gradeConfig[eq.grade as GradeType] || gradeConfig.Common;
  return (
    <div
      className={`
        relative flex items-center gap-1 px-2 border-2  max-w
        bg-cover bg-center
        ${cfg.bgDark} ${cfg.border} hover:border-teal-200 
        hover:brightness-130  transition w-${size} h-${size}
      `}
      style={{ backgroundImage: cfg.bg }} /* 整张卡片背景 */
    >
      <div>
        <img src={eq.icon} alt={eq.name} className="p-0" />
        <div className="absolute bottom-0 right-0 text-[12px] font-bold text-white drop-shadow translate-y-1/4">
          {eq.exceedLevel > 0 ? (
            renderDiamond({
              solid: true,
              value: String(eq.exceedLevel),
              w: 16,
              h: 24,
            })
          ) : (
            <span>+{eq.enchantLevel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function renderEquipSlotSmallWithTooltip({
  eq,
  size = 15,
}: {
  eq: Record<string, any>;
  size: Number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {renderEquipSlotSmall({ eq: eq, size: size })}
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="p-0 rounded-none">
        <EquipTooltip eq={eq} />
      </TooltipContent>
    </Tooltip>
  );
}

export function renderEquipGrid({ equipList = [] }: { equipList: any[] }) {
  return (
    <div className="grid justify-center grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-x-4 gap-y-2 p-4">
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        {equipList.map((eq) => (
          <div key={eq.slotPos}>
            <Tooltip>
              <TooltipTrigger asChild>
                {renderEquipmentSlot({ eq: eq })}
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="center"
                className="p-0 rounded-none"
              >
                <EquipTooltip eq={eq} />
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </TooltipProvider>
    </div>
  );
}
