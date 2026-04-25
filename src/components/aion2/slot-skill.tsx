import { Tooltip, TooltipTrigger, TooltipContent } from "../custom-tooltip";

import { Separator } from "@/components/ui/separator";

export default function SkillTooltip({ skill }: { skill: any }) {
  return (
    <div className="w-64 space-y-2 text-sm">
      <div className="text-base font-bold">{skill.name}</div>
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
          <span className={skill.equip ? "text-green-400" : "text-muted-foreground"}>
            {skill.equip ? "是" : "否"}
          </span>
        </div>
      )}
    </div>
  );
}

export function renderSkillSlot({
  skill,
  scaleFactor = 1,
  showName = false,
  showLevel = true,
}: {
  skill: any;
  scaleFactor: number;
  showName?: boolean;
  showLevel?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative h-16 w-16 rounded border-2 hover:border-orange-500 hover:brightness-130`}
          style={{
            zoom: scaleFactor, // 直接使用 zoom，布局会自适应
          }}
        >
          <div className="relative h-full w-full">
            {/* 图标 */}
            <img
              src={skill.icon}
              alt={skill.name}
              className="h-full w-full rounded-lg object-contain"
            />
            {/* 等级标签 */}
            {showLevel && (
              <span
                className={`absolute right-1 bottom-0 translate-x-1/4 translate-y-1/4 rounded-sm bg-black/70 px-1 py-1 text-[14px] leading-none text-white`}
              >
                Lv. {skill.skillLevel}
              </span>
            )}
            {/* 名称 - 下方居中 */}
            {showName && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-white">
                {skill.name}
              </span>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        <SkillTooltip skill={skill} />
      </TooltipContent>
    </Tooltip>
  );
}
