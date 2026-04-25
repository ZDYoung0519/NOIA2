import { fetchURL } from "@/lib/fetch";

export const fetchFengwoSearchCharacter = async (keyword: string, serverId: number | null) => {
  const params = new URLSearchParams({
    keyword: keyword,
    serverId: serverId ? serverId.toString() : "",
  });

  const url = `https://aion-api.bnshive.com/character/search?${params.toString()}`;
  return fetchURL(url, {
    method: "GET",
  });
};

export const fetchFengwo = async (characterName: string, serverName: string) => {
  const params = new URLSearchParams({
    name: characterName,
    server: serverName,
  });

  const url = `https://aion-api.bnshive.com/character/query?${params.toString()}`;
  return fetchURL(url, {
    method: "GET",
  });
};
