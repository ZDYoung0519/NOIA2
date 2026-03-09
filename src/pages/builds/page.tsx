import { useEffect, useMemo, useState } from "react";
import { Aion2BUILDHistory } from "@/lib/localStorageHistory";
import { BuildDataProps } from "@/types/aion2";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import {
  BuildCard,
  BuildCardSkeleton,
} from "../../components/aion2/build_card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SortOrder = "newest" | "oldest";

export default function BuildsPage() {
  const [localBuilds, setLocalBuilds] = useState<BuildDataProps[]>([]);

  const [onlineBuilds, setOnlineBuilds] = useState<BuildDataProps[]>([]);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [isLoading, setIsLoading] = useState(true);

  const [showClearDialog, setShowClearDialog] = useState(false);

  const handleClearAll = () => {
    Aion2BUILDHistory.clear();
    setLocalBuilds([]);
    setShowClearDialog(false);
  };

  useEffect(() => {
    setLocalBuilds(Aion2BUILDHistory.get());
    setIsLoading(true);
    fetch("/api/aion2/online-builds")
      .then((r) => r.json())
      .then((data) => {
        setOnlineBuilds(data);
        setIsLoading(false);
      })
      .catch(() => {
        setOnlineBuilds([]);
        setIsLoading(false);
      });
  }, []);
  const skeletonCount = 6;

  /* 过滤 + 排序 */
  const displayedOnline = useMemo(() => {
    let filtered =
      classFilter === "all"
        ? onlineBuilds
        : onlineBuilds.filter((b) => b.profile.className === classFilter);

    return filtered.sort((a, b) => {
      const diff =
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [onlineBuilds, classFilter, sortOrder]);

  /* 所有职业去重 */
  const classes = useMemo(
    () => Array.from(new Set(onlineBuilds.map((b) => b.profile.className))),
    [onlineBuilds],
  );

  return (
    <div className="w-full mx-auto p-6 space-y-10">
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogTrigger asChild></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认清除</DialogTitle>
            <DialogDescription>
              确定要清除本地构建记录吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAll}>
              确定清除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- 本地 -------- */}
      <section>
        <div className="flex items-center justify-between pb-5">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">
              我的
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 ml-2">
                本地构筑
              </span>
            </h2>
            <p className="text-slate-500 text-sm">
              本地构筑存储于本地/浏览器缓存
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 gap-5">
            <button
              onClick={() => setShowClearDialog(true)}
              className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
            >
              清空所有
            </button>
            <button
              onClick={() => {}}
              className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
            >
              创建新的BD
            </button>
          </div>
        </div>
        {localBuilds.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无本地配置</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {localBuilds.map((b, index) => (
              <BuildCard
                key={b.id}
                rank={index + 1}
                buildData={b}
                isLocal={true}
                onClick={() => {
                  // router.push(
                  //   `/${locale}/aion2/builds/view?id=${b.id}&isLocal=${true}`,
                  // );
                }}
                onDelete={(id) => {
                  Aion2BUILDHistory.remove(id); // 你自己的本地删除方法
                  setLocalBuilds(Aion2BUILDHistory.get());
                }}
              />
            ))}
          </div>
        )}
      </section>
      {/* -------- 线上 -------- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">所有Build</h2>

          <div className="flex items-center gap-3">
            {/* 过滤职业 */}
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="职业" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部职业</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 排序 */}
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={sortOrder === "newest" ? "default" : "outline"}
                onClick={() => setSortOrder("newest")}
              >
                最新
              </Button>
              <Button
                size="sm"
                variant={sortOrder === "oldest" ? "default" : "outline"}
                onClick={() => setSortOrder("oldest")}
              >
                最旧
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <BuildCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedOnline.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无线上配置</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedOnline.map((b, index) => (
              <BuildCard
                key={b.id}
                rank={index + 1}
                buildData={b}
                isLocal={false}
                onClick={() => {}}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
