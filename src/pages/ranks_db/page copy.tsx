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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, X } from "lucide-react";

interface DbCharacter {
  characterId: string;
  serverId: string;
  profile: {
    characterName?: string;
    className?: string;
    raceName?: string;
    serverName?: string;
    regionName?: string;
  };
  scores: {
    PvEScore: number;
    ItemLevel: number;
    FengwoScore: number;
  };
}

// 筛选下拉组件
function FilterDropdown({
  title,
  options,
  selected,
  onChange,
  placeholder = "全部",
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggleAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const toggleItem = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? `全部 ${title}`
        : `${selected.length} 个已选`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between gap-2">
          <span>{title}</span>
          <Badge variant="secondary" className="ml-1 font-normal">
            {displayText}
          </Badge>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{title}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={toggleAll}
            >
              {selected.length === options.length ? "取消全选" : "全选"}
            </Button>
          </div>
          <Separator />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {options.map((opt) => (
              <div key={opt} className="flex items-center space-x-2">
                <Checkbox
                  id={opt}
                  checked={selected.includes(opt)}
                  onCheckedChange={() => toggleItem(opt)}
                />
                <Label
                  htmlFor={opt}
                  className="text-sm cursor-pointer truncate flex-1"
                >
                  {opt}
                </Label>
              </div>
            ))}
            {options.length === 0 && (
              <p className="text-sm text-muted-foreground">无选项</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 加载骨架屏
function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900/50">
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RanksDBPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DbCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DbCharacter["scores"];
    direction: "asc" | "desc";
  }>({
    key: "PvEScore",
    direction: "desc",
  });

  // 筛选状态
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 获取数据
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: records, error } = await supabase
          .from("NOIA2CHARACTER")
          .select("characterId, serverId, profile, scores");

        if (error) throw error;

        const filtered = (records as DbCharacter[]).filter(
          (item) => item.scores && Object.keys(item.scores).length > 0,
        );

        setData(filtered);
      } catch (err: any) {
        toast.error("加载失败", { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 提取可用的筛选选项
  const classOptions = useMemo(() => {
    const classes = new Set<string>();
    data.forEach((item) => {
      if (item.profile?.className) classes.add(item.profile.className);
    });
    return Array.from(classes).sort();
  }, [data]);

  const serverOptions = useMemo(() => {
    const servers = new Set<string>();
    data.forEach((item) => {
      if (item.serverId) servers.add(item.serverId);
    });
    return Array.from(servers).sort();
  }, [data]);

  // 筛选数据
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // 职业筛选
      if (
        selectedClasses.length > 0 &&
        (!item.profile?.className ||
          !selectedClasses.includes(item.profile.className))
      ) {
        return false;
      }
      // 服务器筛选
      if (
        selectedServers.length > 0 &&
        (!item.serverId || !selectedServers.includes(item.serverId))
      ) {
        return false;
      }
      return true;
    });
  }, [data, selectedClasses, selectedServers]);

  // 排序
  const sortedData = useMemo(() => {
    if (!filteredData.length) return [];
    return [...filteredData].sort((a, b) => {
      const aVal = a.scores[sortConfig.key];
      const bVal = b.scores[sortConfig.key];
      if (aVal === undefined || bVal === undefined) return 0;
      const compare = aVal - bVal;
      return sortConfig.direction === "asc" ? compare : -compare;
    });
  }, [filteredData, sortConfig]);

  // 分页
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage]);

  // 处理排序
  const handleSort = (key: keyof DbCharacter["scores"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
    setCurrentPage(1);
  };

  // 排序指示符
  const getSortIndicator = (key: keyof DbCharacter["scores"]) => {
    if (sortConfig.key !== key) return "↕️";
    return sortConfig.direction === "desc" ? "↓" : "↑";
  };

  // 行点击跳转
  const handleRowClick = (characterId: string, serverId: string) => {
    navigate(`/character/view?characterId=${characterId}&serverId=${serverId}`);
  };

  // 清除所有筛选
  const clearFilters = () => {
    setSelectedClasses([]);
    setSelectedServers([]);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-white mb-6">数据库排行榜</h1>
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-white">数据库排行榜</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* 职业筛选 */}
          <FilterDropdown
            title="职业"
            options={classOptions}
            selected={selectedClasses}
            onChange={(val) => {
              setSelectedClasses(val);
              setCurrentPage(1);
            }}
            placeholder="全部职业"
          />
          {/* 服务器筛选 */}
          <FilterDropdown
            title="服务器"
            options={serverOptions}
            selected={selectedServers}
            onChange={(val) => {
              setSelectedServers(val);
              setCurrentPage(1);
            }}
            placeholder="全部服务器"
          />
          {/* 清除筛选按钮 */}
          {(selectedClasses.length > 0 || selectedServers.length > 0) && (
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

      {filteredData.length === 0 ? (
        <div className="flex items-center justify-center min-h-[300px] text-white/70 bg-slate-900/50 rounded-xl border border-white/10">
          没有符合条件的角色
        </div>
      ) : (
        <>
          <div className="w-full overflow-x-auto rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur-sm">
            <table className="w-full text-white">
              <thead className="border-b border-white/20 bg-slate-800/50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    排名
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    角色
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    职业
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    种族
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    服务器
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium">
                    军团
                  </th>
                  <th
                    className="py-3 px-4 text-right text-sm font-medium cursor-pointer hover:text-blue-400"
                    onClick={() => handleSort("PvEScore")}
                  >
                    PvE评分 {getSortIndicator("PvEScore")}
                  </th>
                  <th
                    className="py-3 px-4 text-right text-sm font-medium cursor-pointer hover:text-blue-400"
                    onClick={() => handleSort("ItemLevel")}
                  >
                    装备等级 {getSortIndicator("ItemLevel")}
                  </th>
                  <th
                    className="py-3 px-4 text-right text-sm font-medium cursor-pointer hover:text-blue-400"
                    onClick={() => handleSort("FengwoScore")}
                  >
                    蜂窝评分 {getSortIndicator("FengwoScore")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {paginatedData.map((character, index) => {
                  const rank = (currentPage - 1) * pageSize + index + 1;
                  const profile = character.profile || {};
                  return (
                    <tr
                      key={character.characterId}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() =>
                        handleRowClick(
                          character.characterId,
                          character.serverId,
                        )
                      }
                    >
                      <td className="py-2 px-4 text-sm">{rank}</td>
                      <td className="py-2 px-4 text-sm font-medium">
                        {profile.characterName || "-"}
                      </td>
                      <td className="py-2 px-4 text-sm">
                        {profile.className || "-"}
                      </td>
                      <td className="py-2 px-4 text-sm">
                        {profile.raceName || "-"}
                      </td>
                      <td className="py-2 px-4 text-sm">
                        {profile.serverName || "-"}
                      </td>
                      <td className="py-2 px-4 text-sm">
                        {profile.regionName || "-"}
                      </td>
                      <td className="py-2 px-4 text-right text-sm">
                        {character.scores.PvEScore?.toFixed(0) ?? "-"}
                      </td>
                      <td className="py-2 px-4 text-right text-sm">
                        {character.scores.ItemLevel?.toFixed(0) ?? "-"}
                      </td>
                      <td className="py-2 px-4 text-right text-sm">
                        {character.scores.FengwoScore?.toFixed(0) ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
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
                disabled={currentPage === totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
