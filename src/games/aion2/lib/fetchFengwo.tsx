import { fetchURL } from "@/lib/fetch";
import { CharacterProps } from "@/games/aion2/types/character";
import { getServerIdByShortName } from "@/games/aion2/lib/servers";

const FENGWO_HEADERS: [string, string][] = [
  [
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
  ],
  ["Referer", "https://aion2.bnshive.com/"],
  ["Origin", "https://aion2.bnshive.com"],
  ["Content-Type", "application/json"],
];

export const fetchFengwoSearchCharacter = async (keyword: string, serverId: number | null) => {
  const params = new URLSearchParams({
    keyword: keyword,
    serverId: serverId ? serverId.toString() : "",
  });

  const url = `https://aion-api.bnshive.com/character/search?${params.toString()}`;
  return fetchURL(url, {
    method: "GET",
    headers: FENGWO_HEADERS,
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
    headers: FENGWO_HEADERS,
  });
};

export const formatFengwoResponse = (data: Record<string, any>) => {
  return {
    characterId: data?.queryResult?.data?.profile?.characterId || null,
    fetchedAt: data?.queryResult?.fetchedAt,
    data: {
      profile: data?.queryResult?.data?.profile || {},
      statList: data?.queryResult?.data?.stat?.statList || [],
      equipmentList: data?.queryResult?.data?.equipment?.equipmentList || [],
      equipmentDetailList: data?.queryResult?.data?.itemDetails || [],
      daevanionDetails: data?.queryResult?.data?.daevanionDetails || [],
      activeNodes: data?.queryResult?.data?.activeNodes || [],
      skillList: data?.queryResult?.data?.skill?.skillList || [],
      petwing: data?.queryResult?.data?.petwing || {},
      ranking: data?.queryResult?.data?.ranking || {},
      title: data?.queryResult?.data?.title || {},
    },
  } as CharacterProps;
};

export const fetchFengwoV2 = async (characterName: string, serverName: string) => {
  const serverId = getServerIdByShortName(serverName);
  if (!serverId) return null;

  const searchResults = await fetchFengwoSearchCharacter(characterName, serverId);
  if (!searchResults?.results?.length) return null;

  const characterId = searchResults.results[0]?.characterId;
  if (!characterId) return null;

  const refreshUrl =
    `https://aion-api.bnshive.com/character/query?` +
    new URLSearchParams({
      serverId: String(serverId),
      characterId,
      refresh: "true",
    }).toString();

  void fetchURL(refreshUrl, {
    method: "GET",
    headers: FENGWO_HEADERS,
  });

  const jobId = `fetch:${serverId}:${characterId}`;
  const statusUrl =
    `https://aion-api.bnshive.com/character/query/status?` +
    new URLSearchParams({
      jobId,
    }).toString();

  const statusRes = await fetchURL(statusUrl, {
    method: "GET",
    headers: FENGWO_HEADERS,
  });
  debugger;
  if (statusRes?.status !== "pending") return statusRes;

  const params = new URLSearchParams({
    name: characterName,
    server: serverName,
  });

  const queryUrl = `https://aion-api.bnshive.com/character/query?${params.toString()}`;

  return fetchURL(queryUrl, {
    method: "GET",
    headers: FENGWO_HEADERS,
  });
};
