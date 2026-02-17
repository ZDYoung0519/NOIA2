import React, { useState } from "react";

interface SpecialCounts {
  [key: string]: number;
}

interface SkillStats {
  skillId: number;
  total_damage: number;
  counts: number;
  special_counts: SpecialCounts;
  min_damage?: number;
  max_damage?: number;
}

interface SkillListProps {
  curPlayerTargetDetailedSkillsArray: SkillStats[];
  curPlayerSkillSlots: Record<number, number[]>;
  // duration: number;
  t: (key: string) => string | null;
  renderSkillIcon: (skillId: number) => React.ReactNode;
  formatNumber: (num: number) => string;
  parsedSkillCodeMap: Record<number, number>;
}

const SkillList: React.FC<SkillListProps> = ({
  curPlayerTargetDetailedSkillsArray,
  curPlayerSkillSlots,
  // duration,
  t,
  renderSkillIcon,
  formatNumber,
  parsedSkillCodeMap,
}) => {
  const [expandedSkillId, setExpandedSkillId] = useState<number | null>(null);

  if (curPlayerTargetDetailedSkillsArray.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-xs">
        暂无技能数据
      </div>
    );
  }

  const maxDamageSkill = curPlayerTargetDetailedSkillsArray[0].total_damage;
  const totalDamageSkills = curPlayerTargetDetailedSkillsArray.reduce(
    (sum, s) => sum + s.total_damage,
    0,
  );

  const calculateSpecialStats = (skill: SkillStats) => {
    const specialMap: Record<
      string,
      { label: string; color: string; barColor: string }
    > = {
      CRITICAL: { label: "暴击", color: "text-rose-300", barColor: "#fb7185" },
      BACK: { label: "背击", color: "text-emerald-300", barColor: "#34d399" },
      DOUBLE: { label: "强击", color: "text-violet-300", barColor: "#a78bfa" },
      ENDURE: { label: "忍耐", color: "text-blue-300", barColor: "#60a5fa" },
      PARRY: { label: "招架", color: "text-slate-300", barColor: "#94a3b8" },
      PERFECT: { label: "完美", color: "text-amber-300", barColor: "#fbbf24" },
    };

    return Object.entries(skill.special_counts || {})
      .filter(([key, value]) => specialMap[key] && value > 0)
      .map(([key, value]) => ({
        key,
        label: specialMap[key].label,
        value,
        percentage: ((value / skill.counts) * 100).toFixed(1),
        color: specialMap[key].color,
        barColor: specialMap[key].barColor,
      }))
      .sort((a, b) => b.value - a.value);
  };

  return (
    <div className="h-full overflow-y-auto p-0 space-y-0.5 simple-scrollbar">
      {curPlayerTargetDetailedSkillsArray.map((skill, _) => {
        // const dps = duration > 0 ? skill.total_damage / duration : 0;
        const percentage =
          totalDamageSkills > 0
            ? (skill.total_damage / totalDamageSkills) * 100
            : 0;
        const fillPercent =
          maxDamageSkill > 0 ? (skill.total_damage / maxDamageSkill) * 100 : 0;

        const skillCode = skill.skillId;
        const originalCode = (parsedSkillCodeMap[skillCode] || 0) as number;
        const skillName = t(`aion2skills:${originalCode.toString()}`);
        const displayName = skillName ?? `技能 ${originalCode}`;

        const isExpanded = expandedSkillId === skill.skillId;
        const slots = curPlayerSkillSlots[originalCode] || [];

        const specialStats = calculateSpecialStats(skill);
        const avgDamage =
          skill.counts > 0 ? Math.floor(skill.total_damage / skill.counts) : 0;

        return (
          <div
            key={skill.skillId}
            className={`rounded overflow-hidden transition-all duration-200 ${isExpanded ? "bg-white/10" : "hover:bg-white/5"}`}
          >
            {/* 主行 */}
            <div
              onClick={() =>
                setExpandedSkillId(isExpanded ? null : skill.skillId)
              }
              className="relative flex items-center h-7 px-2 cursor-pointer group"
            >
              {/* 背景条 */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500/80 to-indigo-500/20 transition-all duration-500"
                style={{ width: `${fillPercent}%` }}
              />

              {/* 展开箭头 */}
              <div
                className={`relative z-10 w-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
              >
                <svg
                  className="w-3 h-3 text-white/30 group-hover:text-white/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>

              {/* 技能图标 */}
              <div className="relative w-6 h-6 ml-1 rounded bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10">
                {renderSkillIcon(originalCode)}
              </div>

              {/* 槽位 */}
              <div className="relative z-10 flex gap-0.5 ml-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`w-4 h-4 rounded-[2px] flex items-center justify-center text-[10px] font-bold ${
                      slots.includes(n)
                        ? "bg-indigo-500/60 text-white"
                        : "bg-white/5 text-white/20"
                    }`}
                  >
                    {n}
                  </div>
                ))}
              </div>

              {/* 名称 */}
              <div className="relative z-10 flex-1 min-w-0 ml-2 flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-white/90 truncate">
                  {displayName}
                </span>
                <span className="text-[10px] text-white/30">
                  {skill.counts}次
                </span>
              </div>

              {/* 数值 */}
              <div className="relative z-10 flex items-baseline gap-3 text-xs font-mono">
                <span className="text-amber-300/80 ml-0.5">
                  {formatNumber(skill.total_damage)}
                </span>
                {/* <span className="text-amber-300/80 tabular-nums">
                  {formatNumber(Math.floor(dps))}
                  <span className="text-[9px] text-amber-300/40 ml-0.5">
                    /s
                  </span>
                </span> */}
                <span className="text-[10px] text-white/30 w-10 text-right tabular-nums">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* 展开详情 */}
            <div
              className={`overflow-hidden transition-all duration-0 ${isExpanded ? "max-h-64" : "max-h-0"}`}
            >
              <div className="px-2 pb-1 pt-1 bg-black/20 border-t border-white/5">
                {/* 伤害统计 */}

                <div className="text-white text-xs">技能ID:{skillCode}</div>
                <div className="text-white text-xs">
                  原始技能ID:{originalCode}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {[
                    {
                      label: "最小",
                      value: skill.min_damage,
                      color: "text-white/40",
                    },
                    {
                      label: "平均",
                      value: avgDamage,
                      color: "text-indigo-300",
                    },
                    {
                      label: "最大",
                      value: skill.max_damage,
                      color: "text-white/40",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="bg-white/5 rounded px-2 py-1.5"
                    >
                      <div className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">
                        {item.label}
                      </div>
                      <div
                        className={`text-xs font-mono font-medium tabular-nums ${item.color}`}
                      >
                        {item.value && item.value > 0
                          ? formatNumber(item.value)
                          : "--"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 特殊攻击 */}
                {specialStats.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {specialStats.map((stat) => (
                      <div key={stat.key} className="flex items-center gap-2">
                        <span className={`text-[10px] w-8 ${stat.color}`}>
                          {stat.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${stat.percentage}%`,
                              backgroundColor: stat.barColor,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-white/50 tabular-nums w-16 text-right">
                          {stat.value}
                          <span className="text-white/30 ml-1">
                            ({stat.percentage}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SkillList;
