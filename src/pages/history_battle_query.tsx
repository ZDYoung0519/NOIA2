import { useCallback, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type HistoryBattleRow = {
  record_id: string;
  battle_ended_at: string | null;
  target_name: string | null;
  target_mob_code: number | null;
  main_actor_name: string | null;
  main_actor_server_id: string | null;
  main_actor_class: string | null;
  main_actor_damage: number | null;
  main_actor_battle_duration: number | null;
  main_actor_dps: number | null;
  party_total_damage: number | null;
};

const MAX_RESULTS = 200;

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatClassName(actorClass: string | null) {
  if (!actorClass) {
    return "-";
  }

  const map: Record<string, string> = {
    GLADIATOR: "剑星",
    TEMPLAR: "守护星",
    ASSASSIN: "杀星",
    RANGER: "弓星",
    SORCERER: "魔道星",
    ELEMENTALIST: "精灵星",
    CLERIC: "治愈星",
    CHANTER: "护法星",
  };

  return map[actorClass] ?? actorClass;
}

export default function HistoryBattleQueryPage() {
  const [actorName, setActorName] = useState("");
  const [serverId, setServerId] = useState("");
  const [rows, setRows] = useState<HistoryBattleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const canSearch = actorName.trim().length > 0 && serverId.trim().length > 0;

  const averageDps = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }

    const total = rows.reduce((sum, row) => sum + Number(row.main_actor_dps ?? 0), 0);
    return total / rows.length;
  }, [rows]);

  const handleSearch = useCallback(async () => {
    const trimmedActorName = actorName.trim();
    const trimmedServerId = serverId.trim();

    if (!trimmedActorName || !trimmedServerId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      setHasSearched(true);

      const { data, error } = await supabase
        .from("aion2_dps")
        .select(
          "record_id,battle_ended_at,target_name,target_mob_code,main_actor_name,main_actor_server_id,main_actor_class,main_actor_damage,main_actor_battle_duration,main_actor_dps,party_total_damage"
        )
        .eq("main_actor_name", trimmedActorName)
        .eq("main_actor_server_id", trimmedServerId)
        .order("battle_ended_at", { ascending: false })
        .limit(MAX_RESULTS);

      if (error) {
        throw error;
      }

      setRows((data ?? []) as HistoryBattleRow[]);
    } catch (error) {
      console.error("Failed to load battle history:", error);
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load battle history");
    } finally {
      setLoading(false);
    }
  }, [actorName, serverId]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 text-white">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">历史战斗查询</h1>
          <p className="mt-2 text-sm text-white/55">
            输入玩家名称和服务器 ID，查询该玩家最近的战斗记录。
          </p>
        </div>

        <Card className="border-white/10 bg-white/5 text-white backdrop-blur-sm">
          <CardHeader>
            <CardTitle>查询条件</CardTitle>
            <CardDescription className="text-white/50">
              当前最多返回最近 {MAX_RESULTS} 条历史战斗。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="history-actor-name">玩家名称</Label>
                <Input
                  id="history-actor-name"
                  value={actorName}
                  onChange={(event) => setActorName(event.target.value)}
                  placeholder="例如：燃烧的浅蓝"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="history-server-id">服务器 ID</Label>
                <Input
                  id="history-server-id"
                  value={serverId}
                  onChange={(event) => setServerId(event.target.value)}
                  placeholder="例如：1007"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => void handleSearch()}
                disabled={!canSearch || loading}
                className="min-w-32"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    查询中...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    查询
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {errorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <Card className="border-white/10 bg-white/5 text-white backdrop-blur-sm">
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription className="text-white/50">
              {hasSearched
                ? `共 ${rows.length} 条，平均秒伤 ${Math.round(averageDps).toLocaleString()}`
                : "查询后会在这里显示该玩家的近期战斗记录。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-white/50">加载中...</div>
            ) : rows.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-white/10">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-white/5 text-white/60">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">战斗时间</th>
                      <th className="px-4 py-3 text-left font-medium">目标</th>
                      <th className="px-4 py-3 text-left font-medium">职业</th>
                      <th className="px-4 py-3 text-right font-medium">个人伤害</th>
                      <th className="px-4 py-3 text-right font-medium">队伍总伤害</th>
                      <th className="px-4 py-3 text-right font-medium">战斗时长</th>
                      <th className="px-4 py-3 text-right font-medium">个人秒伤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.record_id}
                        className="border-t border-white/10 hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3 text-white/75">
                          {formatDateTime(row.battle_ended_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">
                            {row.target_name ?? `Boss ${row.target_mob_code ?? "-"}`}
                          </div>
                          <div className="mt-1 text-xs text-white/40">
                            MobCode: {row.target_mob_code ?? "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/65">
                          {formatClassName(row.main_actor_class)}
                        </td>
                        <td className="px-4 py-3 text-right text-white/85">
                          {Math.round(Number(row.main_actor_damage ?? 0)).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-white/85">
                          {Math.round(Number(row.party_total_damage ?? 0)).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-white/65">
                          {Number(row.main_actor_battle_duration ?? 0).toFixed(1)} 秒
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#d9a73a]">
                          {Math.round(Number(row.main_actor_dps ?? 0)).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : hasSearched ? (
              <div className="py-12 text-center text-sm text-white/50">
                没有查到该玩家的历史战斗记录。
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-white/50">
                输入玩家名称和服务器 ID 后开始查询。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
