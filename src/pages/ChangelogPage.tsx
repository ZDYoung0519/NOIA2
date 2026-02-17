import { useState, useRef } from "react";
import {
  GitCommit,
  Zap,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  Clock,
  Terminal,
  Download,
  ArrowRight,
  Search,
} from "lucide-react";

// --- Types ---

type UpdateType = "major" | "feature" | "fix" | "balance";

interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  type: UpdateType;
  summary: string;
  details: string[];
  downloads?: number;
}

// --- Mock Data ---

const CHANGELOG_DATA: ChangelogEntry[] = [
  {
    id: "v1.0.0",
    version: "v1.0.0",
    date: "2025-10-01",
    title: "永恒诺亚 NOIA2 首次发布",
    type: "major",
    summary: "发布：首个公开版本，支持DPS统计和角色评分查询。",
    downloads: 1200,
    details: ["发布：首个公开版本", "功能：基础 DPS 统计与角色查询"],
  },
];

// --- Components ---

const TypeBadge = ({ type }: { type: UpdateType }) => {
  const styles = {
    major:
      "bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.2)]",
    feature: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    fix: "bg-green-500/10 text-green-400 border-green-500/20",
    balance: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  const icons = {
    major: Sparkles,
    feature: Zap,
    fix: ShieldAlert,
    balance: GitCommit,
  };

  const labels = {
    major: "重大更新",
    feature: "功能更新",
    fix: "修复补丁",
    balance: "数据调整",
  };

  const Icon = icons[type];

  return (
    <span
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wider ${styles[type]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {labels[type]}
    </span>
  );
};

const TimelineNode = ({ active }: { active: boolean }) => (
  <div
    className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 z-20 transition-all duration-500 ${
      active
        ? "bg-purple-500 border-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.8)] scale-125"
        : "bg-slate-900 border-slate-700"
    }`}
  />
);

export default function ChangelogPage() {
  const [expandedId, setExpandedId] = useState<string | null>("v2.1.0");
  const [filter, setFilter] = useState<UpdateType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const filteredData = CHANGELOG_DATA.filter((entry) => {
    const matchesFilter = filter === "all" || entry.type === filter;
    const matchesSearch =
      entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.details.some((d) =>
        d.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen text-slate-300 font-sans selection:bg-purple-500/30">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      </div>

      {/* Header */}
      <header className="relative z-10 pt-20 pb-12 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 mb-6">
          <Clock className="w-3 h-3" />
          <span>Last updated: Just now</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
          更新日志{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
            Changelog
          </span>
        </h1>

        <p className="text-slate-400 max-w-2xl mx-auto text-lg mb-10">
          追踪 NOIA2 的每一次进化。从修复微小的 Bug 到重构整个世界。
        </p>

        {/* Controls */}
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/50 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
          {/* Search */}
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-purple-400 transition-colors" />
            <input
              type="text"
              placeholder="搜索更新内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
            {(["all", "major", "feature", "fix", "balance"] as const).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                    filter === type
                      ? "bg-white text-slate-950 shadow-lg shadow-white/10"
                      : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {type === "all"
                    ? "全部"
                    : type === "major"
                      ? "重大"
                      : type === "feature"
                        ? "功能"
                        : type === "fix"
                          ? "修复"
                          : "平衡"}
                </button>
              ),
            )}
          </div>
        </div>
      </header>

      {/* Timeline Content */}
      <main
        className="relative z-10 max-w-5xl mx-auto px-6 pb-32"
        ref={timelineRef}
      >
        {/* Central Line */}
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-purple-500/20 to-transparent md:-translate-x-1/2" />
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-purple-500/50 blur-sm md:-translate-x-1/2 animate-pulse" />

        <div className="space-y-12">
          {filteredData.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Terminal className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>未找到符合条件的更新记录</p>
            </div>
          ) : (
            filteredData.map((entry, index) => {
              const isExpanded = expandedId === entry.id;
              const isEven = index % 2 === 0;

              return (
                <div
                  key={entry.id}
                  className={`relative flex flex-col md:flex-row gap-8 ${isEven ? "md:flex-row-reverse" : ""}`}
                >
                  {/* Node on Line */}
                  <div className="absolute left-4 md:left-1/2 top-0 md:-translate-x-1/2 z-20">
                    <TimelineNode active={index === 0} />
                  </div>

                  {/* Date (Desktop) */}
                  <div
                    className={`hidden md:block w-5/12 ${isEven ? "text-left" : "text-right"} pt-1`}
                  >
                    <span className="text-sm font-mono text-slate-500">
                      {entry.date}
                    </span>
                    {entry.downloads && (
                      <div
                        className={`text-xs text-slate-600 mt-1 flex items-center gap-1 ${isEven ? "justify-start" : "justify-end"}`}
                      >
                        <Download className="w-3 h-3" />{" "}
                        {entry.downloads.toLocaleString()} 次下载
                      </div>
                    )}
                  </div>

                  {/* Content Card */}
                  <div className="pl-12 md:pl-0 md:w-5/12">
                    <div
                      onClick={() =>
                        setExpandedId(isExpanded ? null : entry.id)
                      }
                      className={`
                        group relative bg-slate-900/40 backdrop-blur-md border border-white/5 
                        rounded-2xl p-6 cursor-pointer transition-all duration-300
                        hover:bg-slate-800/60 hover:border-purple-500/30 hover:shadow-2xl hover:shadow-purple-900/10
                        ${isExpanded ? "ring-1 ring-purple-500/30 bg-slate-800/80" : ""}
                      `}
                    >
                      {/* Mobile Date */}
                      <div className="md:hidden flex items-center gap-2 text-xs text-slate-500 mb-3 font-mono">
                        <Clock className="w-3 h-3" /> {entry.date}
                      </div>

                      {/* Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <TypeBadge type={entry.type} />
                        <span className="font-mono text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-white/5">
                          {entry.version}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                        {entry.title}
                      </h3>

                      <p className="text-slate-400 text-sm leading-relaxed mb-4">
                        {entry.summary}
                      </p>

                      {/* Expandable Details */}
                      <div
                        className={`
                        overflow-hidden transition-all duration-500 ease-in-out
                        ${isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
                      `}
                      >
                        <div className="pt-4 border-t border-white/5 space-y-2">
                          {entry.details.map((detail, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 text-sm text-slate-300"
                            >
                              <ArrowRight className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                              <span>{detail}</span>
                            </div>
                          ))}
                        </div>

                        {/* <div className="mt-6 flex gap-3">
                          <button className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                            <Download className="w-4 h-4" /> 下载此版本
                          </button>
                          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                            查看源码
                          </button>
                        </div> */}
                      </div>

                      {/* Expand Indicator */}
                      <div className="absolute bottom-4 right-4 md:hidden">
                        <ChevronDown
                          className={`w-5 h-5 text-slate-600 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Footer Simple */}
      <footer className="relative z-10 border-t border-white/5 bg-slate-950 py-8 text-center">
        <p className="text-slate-600 text-sm">
          NOIA2 Team © 2026. Designed for AION2.
        </p>
      </footer>
    </div>
  );
}
