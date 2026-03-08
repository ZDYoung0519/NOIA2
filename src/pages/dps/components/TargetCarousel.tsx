import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTranslation } from "react-i18next";

interface TargetSelectProps {
  targets: number[];
  nicknameMap: Record<number, string>;
  mobCodeMap: Record<number, number>;
  mobCodeNameMap: Record<number, string>;
  currentTarget: number | null;
  onChange: (target: number | null) => void;
}

export const TargetCarousel = ({
  targets,
  nicknameMap,
  mobCodeMap,
  mobCodeNameMap,
  currentTarget,
  onChange,
}: TargetSelectProps) => {
  // 将 null 转换为字符串 "all" 以便 Select 组件处理
  const value = currentTarget === null ? "all" : String(currentTarget);

  const handleChange = (val: string) => {
    onChange(val === "all" ? null : Number(val));
  };
  const { t } = useTranslation(["aion2mob"]);

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger
        className="h-6 min-w-[100px] max-w-[120px] text-xs bg-white/5 border-white/10 text-white/80 hover:bg-white/10 focus:ring-white/20"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <SelectValue placeholder="选择目标" />
      </SelectTrigger>
      <SelectContent className="min-w-[120px] bg-neutral-900 border-white/10">
        <SelectItem
          value="all"
          className="text-xs text-white/80 focus:bg-white/10 focus:text-white"
        >
          所有目标
        </SelectItem>
        {targets.map((target) => {
          // const label = nicknameMap[target] || `未知`;
          if (nicknameMap[target]) {
            return null;
          }
          const mobCode = mobCodeMap[target];

          const mobName = mobCode
            ? mobCodeNameMap[mobCode] || t(`${mobCode}`) || `未知(${mobCode})`
            : `未知(${target})`;
          return (
            <SelectItem
              key={target}
              value={String(target)}
              className="text-xs text-white/80 focus:bg-white/10 focus:text-white"
            >
              {mobName}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
