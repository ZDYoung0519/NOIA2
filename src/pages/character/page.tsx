"use client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
} from "@radix-ui/react-select";
import { Input } from "@/components/ui/input";
import { Search, Loader2, X, Star } from "lucide-react";
import { CharacterSearchResult } from "./types";
import { Aion2SearchHistory } from "@/lib/localStorageHistory";
import { searchCharacter } from "./utils";

import { Link } from "react-router-dom";

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
          className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500/90 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 hover:bg-red-600 group-hover:opacity-100 z-10"
          onClick={(e) => onRmButtonClicked(character.characterId, e)}
          title="从历史记录中删除"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      <Link
        to={`/character/view?serverId=${character.serverId}&characterId=${character.characterId}`}
        onClick={handleCardClick}
        className="block rounded-xl bg-white/5 backdrop-blur-md border border-white/10 shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-white/20 hover:-translate-y-1"
      >
        <div className="flex items-start gap-4 p-4">
          {/* 左侧头像 */}
          <div className="flex-shrink-0">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
              <img
                src={character.profileImageUrl}
                className="w-full h-full object-cover"
                alt={character.name}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const container = img.parentElement;
                  if (container) {
                    const fallback = document.createElement("div");
                    fallback.className =
                      "w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xl";
                    fallback.textContent = character.name?.charAt(0) || "?";
                    container.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>

          {/* 中间信息 */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* 角色名 */}

            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-white/90 truncate leading-tight">
                {character.name}
              </h3>
              {/* 等级 */}
              <span className="text-xs font-medium text-white/80 bg-white/10 px-1.5 py-0.5 rounded backdrop-blur-sm">
                Lv.{character.level}
              </span>
            </div>

            {/* 标签 + 服务器 + 等级 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 种族标签 */}
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${
                  character.race === 1
                    ? "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                    : "bg-purple-500/20 text-purple-200 border border-purple-500/30"
                }`}
              >
                {character.race === 1 ? "天族" : "魔族"}
              </span>

              {/* 服务器名 */}
              <span className="text-xs text-white/60 truncate max-w-[100px]">
                {character.serverName}
              </span>
            </div>
          </div>

          {/* 右侧收藏按钮 */}
          <div className="flex-shrink-0 self-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/40 hover:text-yellow-300 hover:bg-yellow-500/20 transition-colors"
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
  raceID: string | null,
  serverID: string | null,
  setIsLoading: (loading: boolean) => void,
  setSearchResults: (results: CharacterSearchResult[]) => void,
): Promise<void> => {
  setIsLoading(true);
  setSearchResults([]);
  try {
    const results = await searchCharacter(
      characterName.trim(),
      raceID ? raceID.toString() : "",
      serverID ? serverID.toString() : "",
    );
    setSearchResults(results);
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
  const [searchResults, setSearchResults] = useState<CharacterSearchResult[]>(
    [],
  );
  const [searchHistory, setSearchHistory] = useState<CharacterSearchResult[]>(
    [],
  );

  useEffect(() => {
    setSearchHistory(Aion2SearchHistory.get());
  }, []);

  const handleRemoveFromHistory = (characterId: string) => {
    Aion2SearchHistory.remove(characterId);
    setSearchHistory(Aion2SearchHistory.get());
  };

  return (
    <div className=" mx-auto py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center">
          <CardTitle className="text-3xl font-bold">角色信息查询</CardTitle>
          <p className="text-muted-foreground">
            输入角色名称并选择种族和服务器进行查询
          </p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <SelectValue
                      placeholder={raceID ? "请选择服务器" : "请先选择种族"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableServers.map((serverInfo) => (
                      <SelectItem
                        key={serverInfo.serverId}
                        value={serverInfo.serverId}
                      >
                        <div className="flex justify-between w-full">
                          <span>{serverInfo.serverName}</span>
                          <span className="text-muted-foreground text-sm ml-2">
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
              onClick={() =>
                handleSearch(
                  characterName,
                  raceID,
                  serverID,
                  setIsLoading,
                  setSearchResults,
                )
              }
              disabled={isLoading || !characterName.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  查询中...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  查询
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="mt-8 py-20">
          <h2 className="text-2xl font-bold mb-4">搜索结果</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((character) => (
              <CharacterCard
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
          <h2 className="text-2xl font-bold mb-4">历史搜索</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchHistory.map((character) => (
              <CharacterCard
                character={character}
                showRmButton={true}
                onRmButtonClicked={handleRemoveFromHistory}
              />
            ))}
          </div>
        </div>
      )}

      {searchResults.length === 0 &&
        !isLoading &&
        characterName &&
        raceID &&
        serverID && (
          <div className="mt-8 text-center">
            <p className="text-muted-foreground">未找到相关角色信息</p>
          </div>
        )}
    </div>
  );
}
