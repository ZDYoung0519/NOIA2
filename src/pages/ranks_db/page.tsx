"use client";

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, X, Grid3x3 } from "lucide-react";

import { BuildCard, BuildCardSkeleton } from "@/components/aion2/build_card";
import { CharacterProps } from "@/types/aion2";

// 常量定义
export const CLASSES = [
  "殺星",
  "劍星",
  "護法星",
  "治愈星",
  "守護星",
  "魔道星",
  "精靈星",
  "弓星",
] as const;

export const TIEN_SERVERS = [
  "希埃爾",
  "奈薩肯",
  "白傑爾",
  "凱西內爾",
  "尤斯迪埃",
  "艾瑞爾",
  "普雷奇翁",
  "梅斯蘭泰達",
  "希塔尼耶",
  "納尼亞",
  "塔哈巴達",
  "路特斯",
  "菲爾諾斯",
  "達彌努",
  "卡薩卡",
  "巴卡爾摩",
  "天加隆",
  "科奇隆",
] as const;

export const ASMODIAN_SERVERS = [
  "伊斯拉佩爾",
  "吉凱爾",
  "崔妮爾",
  "露梅爾",
  "瑪爾庫坦",
  "阿斯佩爾",
  "艾萊修奇卡",
  "布里特拉",
  "奈蒙",
  "哈達爾",
  "盧德萊",
  "鄔爾古倫",
  "默尼",
  "奧達爾",
  "簡卡卡",
  "克羅梅德",
  "奎靈",
  "巴巴隆",
] as const;

export type RaceType = "天族" | "魔族";

interface ServerGroup {
  race: RaceType;
  servers: readonly string[];
}

const SERVER_GROUPS: ServerGroup[] = [
  { race: "天族", servers: TIEN_SERVERS },
  { race: "魔族", servers: ASMODIAN_SERVERS },
];

// 排序选项
const SORT_OPTIONS = [
  { value: "ItemLevel", label: "装备等级", column: "scores->ItemLevel" },
  { value: "damageTotal", label: "总攻击", column: "scores->damageTotal" },
  { value: "FengwoScore", label: "蜂窝评分", column: "scores->FengwoScore" },
  { value: "PvEScore", label: "综合评分", column: "scores->PvEScore" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

// 单选筛选组件
function SingleSelectFilter({
  title,
  options,
  selected,
  onChange,
  placeholder = "全部",
  disabled = false,
}: {
  title: string;
  options: readonly string[] | string[];
  selected: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    if (selected === value) {
      onChange(null);
    } else {
      onChange(value);
    }
    setOpen(false);
  };

  const displayText = selected || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-between gap-2 min-w-[140px]"
          disabled={disabled}
        >
          <span>{title}</span>
          <Badge
            variant={selected ? "default" : "secondary"}
            className="ml-1 font-normal truncate max-w-[100px]"
          >
            {displayText}
          </Badge>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{title}</span>
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                清除
              </Button>
            )}
          </div>
          <Separator />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {options.map((opt) => (
              <div
                key={opt}
                className={`flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-white/10 ${
                  selected === opt ? "bg-white/20" : ""
                }`}
                onClick={() => handleSelect(opt)}
              >
                <span className="text-sm flex-1">{opt}</span>
                {selected === opt && (
                  <span className="text-xs text-blue-400">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 加载骨架屏
function GridSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[...Array(5)].map((_, i) => (
          // <Skeleton key={i} className="h-64 w-full rounded-xl" />
          <BuildCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function RanksDBPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<CharacterProps[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // 筛选状态 - 改为单选
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedRace, setSelectedRace] = useState<RaceType | "所有">("所有");
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  // 排序状态
  const [sortKey, setSortKey] = useState<SortKey>("PvEScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 获取当前种族可用的服务器选项
  const availableServers = useMemo(() => {
    if (selectedRace === "所有") {
      return [...TIEN_SERVERS, ...ASMODIAN_SERVERS].sort();
    }
    const group = SERVER_GROUPS.find((g) => g.race === selectedRace);
    return group ? [...group.servers] : [];
  }, [selectedRace]);

  // 当种族改变时，清空服务器选择
  useEffect(() => {
    setSelectedServer(null);
    setCurrentPage(1);
  }, [selectedRace]);

  // 获取数据的函数
  const fetchData = async () => {
    setLoading(true);
    setData([]);

    try {
      let query = supabase
        .from("NOIA2CHARACTER")
        .select("characterId, serverId, profile, scores, info, updatedAt", {
          count: "exact",
        });

      // 应用筛选条件 - 改为单选
      if (selectedClass) {
        query = query.filter("profile->>className", "eq", selectedClass);
      }

      if (selectedRace !== "所有") {
        query = query.filter("profile->>raceName", "eq", selectedRace);
      }

      if (selectedServer) {
        query = query.eq("profile->>serverName", selectedServer);
      }

      // 只返回有评分的角色
      query = query.not("scores", "is", null);

      // 应用排序
      const sortOption = SORT_OPTIONS.find((opt) => opt.value === sortKey);
      if (sortOption) {
        query = query.order(sortOption.column, {
          ascending: sortDirection === "asc",
          nullsFirst: false,
        });
      }

      // 应用分页
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: records, error, count } = await query.range(from, to);

      if (error) throw error;

      setData(records as CharacterProps[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast.error("加载失败", { description: err.message });
      setData([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // 当筛选、排序或分页改变时重新获取数据
  useEffect(() => {
    fetchData();
  }, [
    selectedClass,
    selectedRace,
    selectedServer,
    sortKey,
    sortDirection,
    currentPage,
  ]);

  // 清除所有筛选
  const clearFilters = () => {
    setSelectedClass(null);
    setSelectedRace("所有");
    setSelectedServer(null);
    setCurrentPage(1);
  };

  // 切换排序方向
  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    setCurrentPage(1);
  };

  // 处理排序字段变化
  const handleSortKeyChange = (value: SortKey) => {
    setSortKey(value);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1500px]">
        <GridSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] py-20">
      <div className="flex flex-col gap-2">
        {/* 标题和筛选行 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-white">数据库排行榜</h1>

          <div className="flex flex-wrap items-center gap-3">
            {/* 职业筛选 - 改为单选 */}
            <SingleSelectFilter
              title="职业"
              options={CLASSES}
              selected={selectedClass}
              onChange={(val) => {
                setSelectedClass(val);
                setCurrentPage(1);
              }}
              placeholder="全部职业"
            />

            {/* 种族筛选 */}
            <Select
              value={selectedRace}
              onValueChange={(value: RaceType | "所有") => {
                setSelectedRace(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="选择种族" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="所有">所有种族</SelectItem>
                <SelectItem value="天族">天族</SelectItem>
                <SelectItem value="魔族">魔族</SelectItem>
              </SelectContent>
            </Select>

            {/* 服务器筛选 - 改为单选 */}
            <SingleSelectFilter
              title="服务器"
              options={availableServers}
              selected={selectedServer}
              onChange={(val) => {
                setSelectedServer(val);
                setCurrentPage(1);
              }}
              placeholder={
                selectedRace === "所有"
                  ? "全部服务器"
                  : `全部${selectedRace}服务器`
              }
            />

            {/* 排序选择 */}
            <Select value={sortKey} onValueChange={handleSortKeyChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 排序方向 */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSortDirection}
              className="w-10"
              title={sortDirection === "desc" ? "从高到低" : "从低到高"}
            >
              {sortDirection === "desc" ? "↓" : "↑"}
            </Button>

            {/* 清除筛选按钮 */}
            {(selectedClass || selectedRace !== "所有" || selectedServer) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                清除筛选
              </Button>
            )}
          </div>
        </div>

        {/* 结果统计 */}
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>共 {totalCount} 个角色</span>
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4" />
            <span>卡片视图</span>
          </div>
        </div>

        {/* 卡片网格 */}
        {totalCount === 0 ? (
          <div className="flex items-center justify-center min-h-[400px] text-white/70 bg-slate-900/50 rounded-xl border border-white/10">
            没有符合条件的角色
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 overflow-x-hidden overflow-y-visible simple-scrollbar h-[65vh]">
              {data.map((character, index) => (
                <div
                  key={character.characterId}
                  onClick={() =>
                    navigate(
                      `/character/view?characterId=${character.characterId}&serverId=${character.serverId}`,
                    )
                  }
                  className=""
                >
                  <BuildCard
                    rank={index + 1 + (currentPage - 1) * pageSize}
                    buildData={character}
                    isLocal={true}
                    onClick={() => {}}
                  />
                </div>
              ))}
            </div>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  上一页
                </Button>
                <span className="text-sm text-white/70">
                  第 {currentPage} / {totalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages || loading}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
