import React from "react";

import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipProvider, TooltipContent } from "../custom-tooltip";

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
    <div className="relative grid place-items-center" style={{ width: w, height: h }}>
      {/* 外层菱形 */}
      <div
        className="absolute inset-0 bg-teal-500"
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
          className="relative text-lg font-bold text-white select-none"
          style={{ fontSize, lineHeight: 1 }}
        >
          {value}
        </span>
      )}
    </div>
  );
};

export function EquipTooltip({ eq }: { eq: any }) {
  const info = eq.detail;
  const cfg = gradeConfig[info.grade as GradeType];

  const soulBindRate = Number(info?.soulBindRate);
  const magicStoneStat = info?.magicStoneStat;
  const godStoneStat = info?.godStoneStat as {
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
        className={`relative flex items-start justify-between rounded-none border-2 bg-cover bg-center p-3 ${cfg.bgDark} ${cfg.border} z-100 cursor-pointer transition hover:border-orange-500 hover:brightness-110`}
        style={{ backgroundImage: cfg.bg }}
      >
        {/* 左侧信息：左上对齐 */}
        <div className="z-10 flex flex-col items-start gap-1">
          <div className={`font-semibold ${cfg.text} text-xl`}>
            +{info.enchantLevel} {info.name}
          </div>
          <div className="text-md">
            <span className={gradeConfig[(info?.grade as GradeType) || "Common"]?.text}>
              {info?.gradeName || "Common"}
            </span>
            <span>{info?.categoryName || ""}</span>
          </div>

          <div className="text-md">道具等级{info.itemLevel}</div>
          <div className="text-md">
            {info.level}(+{info.level}){info.itemLevel}
          </div>
        </div>

        {/* 右侧：图片 + 槽位 */}
        <div className="z-10 flex flex-col items-end gap-0">
          {/* 装备图 */}
          <img
            src={info.icon}
            alt={info.name}
            className="h-25 w-25 rounded-md object-contain p-0 select-none"
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
      {/* 灵魂刻印 */}
      {soulBindRate && (
        <>
          <Separator />
          <div className="space-y-2 p-3">
            <div className="flex justify-between">
              <span className={`tex${soulBindRate === 100 ? "text-yellow-400" : "text-teal-400"}`}>
                灵魂刻印率
              </span>
              <span className="">{soulBindRate}%</span>
            </div>

            {/* 进度条容器 */}
            <div className="h-1 w-full bg-gray-700">
              <div
                className={`h-full ${soulBindRate === 100 ? "bg-yellow-400" : "bg-teal-400"}`}
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
                  <div key={s.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={"/images/aion2/icon_skill.png"}
                        alt=""
                        className="h-4 w-4 select-none"
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
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          {magicStoneStat?.map((s: any, idx: number) => (
            <div
              key={`${s.id}-${idx}`}
              className={`flex items-center space-x-2 ${gradeConfig[s.grade as GradeType]?.text}`}
            >
              <img src={s.icon} alt="" className="h-10 w-10 select-none" />
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
        <div className="space-y-2 p-3">
          {godStoneStat.map((g) => (
            <div key={g.slotPos} className="flex items-start gap-2">
              <img src={g.icon} alt="" className="h-6 w-6 shrink-0" />
              <div className="flex-1">
                <div className={`font-semibold ${gradeConfig[g.grade as GradeType]?.text || ""}`}>
                  {g.name}
                </div>
                {/* 把换行符替换成 <br /> 就能在 JSX 里正确换行 */}
                <div className="text-muted-foreground text-sm whitespace-pre-line">
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

export function renderEquipmentSlot({ eq, showName = true }: { eq: any; showName?: boolean }) {
  const grade = eq.detail.grade as GradeType;
  const cfg = gradeConfig[grade] || gradeConfig.Common;

  return (
    <div
      className={`max-w relative flex items-center gap-1 border-2 bg-cover bg-center px-2 ${cfg.bgDark} ${cfg.border} transition hover:border-teal-200 hover:brightness-130`}
      style={{ backgroundImage: cfg.bg }} /* 整张卡片背景 */
    >
      {/* 图标 */}
      <img
        src={eq.detail.icon}
        alt={eq.detail.name}
        className="h-10 w-10 rounded-md object-contain"
      />
      {eq.detail.exceedLevel > 0 ? (
        renderDiamond({
          solid: true,
          value: String(eq.detail.exceedLevel),
          w: 16,
          h: 20,
        })
      ) : (
        <span className="h-14 w-8" style={{ marginLeft: "-20px" }} />
      )}
      {/* 名称 & 强化等级 */}
      {showName && (
        <div className={`font-semibold ${cfg.text} select-none`}>
          +{eq.detail.enchantLevel} {eq.detail.name}
        </div>
      )}
    </div>
  );
}

export function renderEquipmentSlotWithTooltip({
  eq,
  showName = true,
}: {
  eq: any;
  showName?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{renderEquipmentSlot({ eq: eq, showName: showName })}</TooltipTrigger>
      <TooltipContent side="right" align="start" className="rounded-none p-0">
        <EquipTooltip eq={eq} />
      </TooltipContent>
    </Tooltip>
  );
}

export function renderEquipSlotSmall({ eq, size = 15 }: { eq: any; size: Number }) {
  const cfg = gradeConfig[eq.detail.grade as GradeType] || gradeConfig.Common;
  return (
    <div
      className={`max-w relative flex items-center gap-0 border-2 bg-cover bg-center px-0 ${cfg.bgDark} ${cfg.border} transition hover:border-teal-200 hover:brightness-130 w-${size} h-${size} `}
      style={{ backgroundImage: cfg.bg }} /* 整张卡片背景 */
    >
      <div>
        <img src={eq.detail.icon} alt={eq.detail.name} className="h-full w-full p-0" />
        <div className="absolute right-0 bottom-0 translate-y-1/4 text-[12px] font-bold text-white drop-shadow">
          {eq.detail.exceedLevel > 0 ? (
            renderDiamond({
              solid: true,
              value: String(eq.detail.exceedLevel),
              w: 14,
              h: 18,
            })
          ) : (
            <span>+{eq.detail.enchantLevel}</span>
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
      <TooltipTrigger asChild>{renderEquipSlotSmall({ eq: eq, size: size })}</TooltipTrigger>
      <TooltipContent side="right" align="start" className="rounded-none p-0">
        <EquipTooltip eq={eq} />
      </TooltipContent>
    </Tooltip>
  );
}

export function renderEquipGrid({ equipList = [] }: { equipList: any[] }) {
  return (
    <div className="grid grid-cols-1 justify-center gap-x-4 gap-y-2 p-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        {equipList.map((eq) => (
          <div key={eq.slotPos}>
            <Tooltip>
              <TooltipTrigger asChild>{renderEquipmentSlot({ eq: eq })}</TooltipTrigger>
              <TooltipContent side="right" align="center" className="rounded-none p-0">
                <EquipTooltip eq={eq} />
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </TooltipProvider>
    </div>
  );
}

const isEffectValue = (s: string) => {
  return Number(String(s !== null && s !== void 0 ? s : "").replace("%", "")) != 0;
};

export function renderEquipmentInfo({ eq }: { eq: Record<string, any> }) {
  const info = eq.detail;
  const soulBindRate = Number(info?.soulBindRate);
  const magicStoneStat = info?.magicStoneStat;
  // const godStoneStat = info?.godStoneStat;
  return (
    <div className="rounded-lg p-2">
      {renderEquipmentSlotWithTooltip({ eq: eq })}

      <div className="grid grid-cols-3 gap-0 text-sm">
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

        {soulBindRate && (
          <>
            <div className="space-y-2 p-3">
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
              {info?.subSkills?.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={"/images/aion2/icon_skill.png"}
                      alt=""
                      className="h-4 w-4 select-none"
                    />
                    <span className="text-teal-400 underline">{s.name}</span>
                  </div>

                  <span className="text-sm">Lv.+{s.level}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="space-y-2 p-3">
          <div className="grid grid-cols-1 gap-2">
            {magicStoneStat?.map((s: any, idx: number) => (
              <div
                key={`${s.id}-${idx}`}
                className={`flex items-center space-x-2 ${gradeConfig[s.grade as GradeType]?.text}`}
              >
                <img src={s.icon} alt="" className="h-5 w-5 select-none" />
                <span className="text-left">
                  {s.name}
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
