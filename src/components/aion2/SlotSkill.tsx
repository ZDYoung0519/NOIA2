import { Tooltip, TooltipTrigger, TooltipContent } from "./custom-tooltip";

import { Separator } from "@/components/ui/separator";

export default function SkillTooltip({ skill }: { skill: any }) {
  return (
    <div className="w-64 space-y-2 text-sm">
      <div className="font-bold text-base">{skill.name}</div>
      <Separator />
      <div className="flex justify-between">
        <span>类别</span>
        <span className="text-muted-foreground">{skill.category}</span>
      </div>
      <div className="flex justify-between">
        <span>需求等级</span>
        <span className="text-muted-foreground">Lv.{skill.needLevel}</span>
      </div>
      <div className="flex justify-between">
        <span>当前等级</span>
        <span className="text-muted-foreground">Lv.{skill.skillLevel}</span>
      </div>
      {skill.category === "Active" && (
        <div className="flex justify-between">
          <span>已装备</span>
          <span
            className={skill.equip ? "text-green-400" : "text-muted-foreground"}
          >
            {skill.equip ? "是" : "否"}
          </span>
        </div>
      )}
    </div>
  );
}

export function renderSkillSlot({ skill }: { skill: any }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative rounded border-2 hover:border-orange-500 hover:brightness-130 w-14 h-14">
          <div className="relative w-full h-full">
            {/* 图标 */}
            <img
              src={skill.icon}
              alt={skill.name}
              className="rounded-lg w-full h-full object-contain"
            />

            {/* 等级标签 */}
            <span
              className="absolute bottom-0 right-1 translate-x-1/4 translate-y-1/4
               text-xs bg-black/70 text-white px-1 py-1 rounded-sm leading-none"
            >
              Lv. {skill.skillLevel}
            </span>

            {/* 名称 - 下方居中 */}
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap">
              {skill.name}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        <SkillTooltip skill={skill} />
      </TooltipContent>
    </Tooltip>
  );
}
