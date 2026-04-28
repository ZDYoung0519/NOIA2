import { fetchURL } from "@/lib/fetch";
import { CharacterProps } from "@/types/character";

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
