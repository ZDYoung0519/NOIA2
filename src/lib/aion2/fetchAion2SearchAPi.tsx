import { CharacterSearchResult } from "@/types/character";
import { invoke } from "@tauri-apps/api/core";


export const fetchAion2SearchAPi = async (
  keyword: string,
  race: string,
  serverId: string,
): Promise<CharacterSearchResult[]> => {
  const params = new URLSearchParams({
    keyword: keyword,
    race: race,
    serverId: serverId,
  });

  const targetUrl = `https://tw.ncsoft.com/aion2/api/search/aion2tw/search/v2/character?${params.toString()}`;
  const response = (await invoke("http_request", {
    params: {
      url: targetUrl,
      method: "GET",
      headers: [["User-Agent", "Tauri App"]],
    },
  })) as { status: number; body: string };
  const data = JSON.parse(response.body)?.list as CharacterSearchResult[];

  const results = data.map((character) => ({
    ...character,
    name: character.name.replace(/<\/?strong>/g, ""),
    profileImageUrl: `https://profileimg.plaync.com${character.profileImageUrl}`,
    characterId: decodeURIComponent(character.characterId), // ← 新增
  })) as CharacterSearchResult[];
  return results;
};

