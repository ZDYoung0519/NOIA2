import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardTitle } from "@/components/ui/card";
import { Search, Loader2, X, Star } from "lucide-react";
import { Link } from "react-router-dom";

import { CharacterSearchResult } from "@/types/character";
import { fetchFengwoSearchCharacter } from "@/lib/aion2/fetchFengwo";
import { Aion2SearchHistory } from "@/lib/localStorageHistory";

const CharacterCard = ({
  character,
  showRmButton,
  onRmButtonClicked,
}: {
  character: CharacterSearchResult;
  showRmButton: boolean;
  onRmButtonClicked: (characterId: string, e: React.MouseEvent) => void;
}) => {
  const handleCardClick = () => {
    Aion2SearchHistory.add(character);
  };

  return (
    <div className="group relative">
      {/* 删除按钮 - 悬停时显示 */}
      {showRmButton && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-2 -right-2 z-10 h-7 w-7 rounded-full bg-red-500/90 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-red-600"
          onClick={(e) => onRmButtonClicked(character.characterId, e)}
          title="从历史记录中删除"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      <Link
        to={`/character/view?serverId=${character.serverId}&characterName=${character.characterName}`}
        onClick={handleCardClick}
        className="block rounded-xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl"
      >
        <div className="flex items-start gap-4 p-4">
          {/* 左侧头像 */}
          <div className="flex-shrink-0">
            <div className="relative h-16 w-16 overflow-hidden rounded-xl border-2 border-white/20 shadow-lg">
              <img
                src={character.profileImageUrl}
                className="h-full w-full object-cover"
                alt={character.characterName}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const container = img.parentElement;
                  if (container) {
                    const fallback = document.createElement("div");
                    fallback.className =
                      "w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xl";
                    fallback.textContent = character.characterName?.charAt(0) || "?";
                    container.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>

          {/* 中间信息 */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* 角色名 */}

            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base leading-tight font-semibold text-white/90">
                {character.characterName}
              </h3>
              {/* 等级 */}
              {/* <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white/80 backdrop-blur-sm">
                Lv.{character.level}
              </span> */}
            </div>

            {/* 标签 + 服务器 + 等级 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 种族标签 */}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm ${
                  character.raceId === 1
                    ? "border border-blue-500/30 bg-blue-500/20 text-blue-200"
                    : "border border-purple-500/30 bg-purple-500/20 text-purple-200"
                }`}
              >
                {character.raceId === 1 ? "天族" : "魔族"}
              </span>

              {/* 服务器名 */}
              <span className="max-w-[100px] truncate text-xs text-white/60">
                {character.serverName}
              </span>
            </div>
          </div>

          {/* 右侧收藏按钮 */}
          <div className="flex-shrink-0 self-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/40 transition-colors hover:bg-yellow-500/20 hover:text-yellow-300"
            >
              <Star className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Link>
    </div>
  );
};

const handleSearch = async (
  characterName: string,

  serverID: string | null,
  setIsLoading: (loading: boolean) => void,
  setSearchResults: (results: CharacterSearchResult[]) => void
): Promise<void> => {
  setIsLoading(true);
  setSearchResults([]);
  try {
    const results = await fetchFengwoSearchCharacter(
      characterName.trim(),
      serverID ? parseInt(serverID) : null
    );
    setSearchResults((results?.results || []) as CharacterSearchResult[]);
  } catch {
  } finally {
    setIsLoading(false);
  }
};

export default function CharacterSearchPage() {
  const [characterName, setCharacterName] = useState<string>("");
  // const [raceID, setRaceID] = useState<string | null>(null);
  // const [serverID, setServerID] = useState<string | null>(null);
  // const [availableServers, setAvailableServers] = useState<any[]>([]);
  const raceID = null;
  const serverID = null;
  const availableServers = Array();

  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<CharacterSearchResult[]>([]);
  const [searchHistory, setSearchHistory] = useState<CharacterSearchResult[]>([]);

  useEffect(() => {
    setSearchHistory(Aion2SearchHistory.get());
  }, []);

  const handleRemoveFromHistory = (characterId: string) => {
    Aion2SearchHistory.remove(characterId);
    setSearchHistory(Aion2SearchHistory.get());
  };

  return (
    <div className="mx-auto h-full w-full max-w-5xl px-4 py-10 py-50">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <CardTitle className="text-3xl font-bold">角色信息查询</CardTitle>
          <p className="text-muted-foreground">输入角色名称并选择种族和服务器进行查询</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">角色名称</label>
              <Input
                placeholder="输入角色名称"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                // onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">种族</label>
                <Select
                  value={raceID || undefined}
                  //   onValueChange={handleRaceSelect}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择种族" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="天族">天族</SelectItem>
                    <SelectItem value="魔族">魔族</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">服务器</label>
                <Select
                  value={serverID || undefined}
                  //   onValueChange={handleServerSelect}
                  disabled={!raceID || isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={raceID ? "请选择服务器" : "请先选择种族"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableServers.map((serverInfo) => (
                      <SelectItem key={serverInfo.serverId} value={serverInfo.serverId}>
                        <div className="flex w-full justify-between">
                          <span>{serverInfo.serverName}</span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            ({serverInfo.serverShortName})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleSearch(characterName, serverID, setIsLoading, setSearchResults)}
              disabled={isLoading || !characterName.trim()}
              className="flex-1"
            >
              {isLoading ? (
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
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="mt-8 py-20">
          <h2 className="mb-4 text-2xl font-bold">搜索结果</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((character) => (
              <CharacterCard
                key={character.characterId}
                character={character}
                showRmButton={false}
                onRmButtonClicked={handleRemoveFromHistory}
              />
            ))}
          </div>
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="mt-8 py-20">
          <h2 className="mb-4 text-2xl font-bold">历史搜索</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {searchHistory.map((character) => (
              <CharacterCard
                key={character.characterId}
                character={character}
                showRmButton={true}
                onRmButtonClicked={handleRemoveFromHistory}
              />
            ))}
          </div>
        </div>
      )}

      {searchResults.length === 0 && !isLoading && characterName && raceID && serverID && (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">未找到相关角色信息</p>
        </div>
      )}
    </div>
  );
}
