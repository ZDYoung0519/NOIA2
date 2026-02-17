import { invoke } from "@tauri-apps/api/core";
import { useState, useMemo, useEffect } from "react";

import { getCharacterData } from "../character_view/utils/getCharacterData";
import { processCharacterData } from "../character_view/utils/processCharacterData";
import { CharacterProps } from "../character_view/types";

import { uploadCharacterData } from "@/lib/uploadCharacterData";

export default function RanksPage() {
  const [rankData, setRankData] = useState<CharacterProps[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
  });

  // 排序配置
  const [sortConfig, setSortConfig] = useState<{
    key: keyof CharacterProps["scores"];
    direction: "asc" | "desc";
  }>({
    key: "PvEScore",
    direction: "desc",
  });

  // 分页配置
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50; // 每页显示10条

  // 带重试的获取函数
  const fetchWithRetry = async (
    characterId: string,
    serverId: number,
    maxRetries: number = 5,
  ): Promise<CharacterProps | null> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await getCharacterData(
          characterId,
          serverId.toString(),
          "zh",
        );
        const processed = processCharacterData(data);
        setProgress((prev) => ({
          ...prev,
          completed: prev.completed + 1,
          success: prev.success + 1,
        }));
        return processed;
      } catch (error) {
        console.warn(`角色 ${characterId} 第 ${attempt} 次尝试失败`, error);
        if (attempt === maxRetries) {
          setProgress((prev) => ({
            ...prev,
            completed: prev.completed + 1,
            failed: prev.failed + 1,
          }));
          console.error(`角色 ${characterId} 重试 ${maxRetries} 次后仍然失败`);
          return null;
        }
        // 指数退避等待
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    return null;
  };

  const handleScrapy = async () => {
    if (loading) return;
    setLoading(true);
    setRankData([]);
    setCurrentPage(1); // 重置到第一页

    const url =
      "https://aion-api.bnshive.com/ranking/rating-score?modelType=PVE&modelVersion=PvE-2.0&page=1&size=100";
    try {
      const response = (await invoke("http_request", {
        params: {
          url: url,
          method: "GET",
          headers: [["User-Agent", "Tauri App"]],
        },
      })) as { status: number; body: string };

      const data = JSON.parse(response.body);
      const rankings = (data?.rankings || []) as {
        rank: number;
        characterId: string;
        serverId: number;
      }[];

      const total = rankings.length;
      setProgress({ total, completed: 0, success: 0, failed: 0 });

      const promises = rankings.map((element) => {
        const { characterId, serverId } = element;
        return fetchWithRetry(characterId, serverId, 5);
      });

      const results = await Promise.all(promises);
      const successfulResults = results.filter(
        (item): item is CharacterProps => item !== null,
      );
      await uploadCharacterData(successfulResults);
      setRankData(successfulResults);
    } catch (error) {
      console.error("爬取失败", error);
    } finally {
      setLoading(false);
    }
  };

  // 根据排序配置对数据进行排序
  const sortedData = useMemo(() => {
    if (!rankData.length) return [];
    const sorted = [...rankData].sort((a, b) => {
      const aVal = a.scores[sortConfig.key];
      const bVal = b.scores[sortConfig.key];
      if (aVal === undefined || bVal === undefined) return 0;
      const compare = aVal - bVal;
      return sortConfig.direction === "asc" ? compare : -compare;
    });
    return sorted;
  }, [rankData, sortConfig]);

  // 分页计算
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // 当前页超出总页数时自动调整
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedData.length, currentPage, totalPages]);

  // 处理排序点击
  const handleSort = (key: keyof CharacterProps["scores"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
    setCurrentPage(1); // 切换排序后回到第一页
  };

  // 排序指示符
  const getSortIndicator = (key: keyof CharacterProps["scores"]) => {
    if (sortConfig.key !== key) return "↕️";
    return sortConfig.direction === "desc" ? "↓" : "↑";
  };

  return (
    <>
      <div className="flex gap-4 items-center">
        <button
          className={`px-8 py-4 bg-white text-slate-950 rounded-xl font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2 ${
            loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={handleScrapy}
          disabled={loading}
        >
          {loading ? "爬取中..." : "爬取数据"}
        </button>
      </div>

      {/* 进度显示 */}
      {loading && (
        <div className="mt-4 p-4 bg-slate-800/30 rounded-xl text-white">
          <div className="text-sm font-mono">
            进度: {progress.completed} / {progress.total} (成功:{" "}
            {progress.success}, 失败: {progress.failed})
          </div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-green-500 h-full transition-all duration-300"
              style={{
                width: `${(progress.completed / progress.total) * 100}%`,
              }}
            ></div>
          </div>
        </div>
      )}

      {/* 排行榜表格 */}
      {!loading && rankData.length > 0 && (
        <div className="mt-8 w-full overflow-x-auto">
          <table className="w-full text-white border-collapse">
            <thead>
              <tr className="border-b border-white/20">
                <th className="py-2 px-4 text-left">排名</th>
                <th className="py-2 px-4 text-left">角色</th>
                <th className="py-2 px-4 text-left">职业</th>
                <th className="py-2 px-4 text-left">种族</th>
                <th className="py-2 px-4 text-left">服务器</th>
                <th className="py-2 px-4 text-left">军团</th>
                <th
                  className="py-2 px-4 text-right cursor-pointer hover:text-blue-400"
                  onClick={() => handleSort("PvEScore")}
                >
                  PvE评分 {getSortIndicator("PvEScore")}
                </th>
                <th
                  className="py-2 px-4 text-right cursor-pointer hover:text-blue-400"
                  onClick={() => handleSort("ItemLevel")}
                >
                  装备等级 {getSortIndicator("ItemLevel")}
                </th>
                <th
                  className="py-2 px-4 text-right cursor-pointer hover:text-blue-400"
                  onClick={() => handleSort("FengwoScore")}
                >
                  蜂窝评分 {getSortIndicator("FengwoScore")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((character, index) => {
                const rank = (currentPage - 1) * pageSize + index + 1;
                const profile = character.profile;
                return (
                  <tr
                    key={character.characterId || index}
                    className="border-b border-white/10 hover:bg-white/5"
                  >
                    <td className="py-2 px-4">{rank}</td>
                    <td className="py-2 px-4">
                      {profile.characterName || "-"}
                    </td>
                    <td className="py-2 px-4">{profile.className || "-"}</td>
                    <td className="py-2 px-4">{profile.raceName || "-"}</td>
                    <td className="py-2 px-4">{profile.serverName || "-"}</td>
                    <td className="py-2 px-4">{profile.regionName || "-"}</td>
                    <td className="py-2 px-4 text-right">
                      {character.scores.PvEScore}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {character.scores.ItemLevel}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {character.scores.FengwoScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-4 text-white">
              <button
                className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50 hover:bg-slate-600"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </button>
              <span>
                第 {currentPage} 页 / 共 {totalPages} 页
              </span>
              <button
                className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50 hover:bg-slate-600"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 无数据提示 */}
      {!loading && rankData.length === 0 && (
        <div className="mt-8 text-white/70 text-center">
          暂无数据，请点击“爬取数据”按钮获取排行榜
        </div>
      )}
    </>
  );
}
