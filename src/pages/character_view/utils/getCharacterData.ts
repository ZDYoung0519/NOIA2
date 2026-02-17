import { CharacterProps } from "../types";
import { fetchURL } from "@/lib/fetch";

const getCharacterInfoData = async (
  characterId: string,
  serverId: string,
  lang: string,
) => {
  const params = new URLSearchParams({
    characterId,
    serverId,
    lang,
  });
  const url = `https://tw.ncsoft.com/aion2/api/character/info?${params.toString()}`;
  const data = await fetchURL(url);

  return data;
};

const getEuqipmentData = async (
  equipmentList: any,
  characterId: string,
  serverId: string,
  lang: string,
) => {
  const itemPromises = equipmentList.map(async (item: any) => {
    const itemUrl = `https://tw.ncsoft.com/aion2/api/character/equipment/item?id=${
      item.id
    }&enchantLevel=${
      item.enchantLevel + item.exceedLevel
    }&characterId=${characterId}&serverId=${serverId}&slotPos=${
      item.slotPos
    }&lang=${lang}`;
    item.item_info = {};
    item.item_info.url = itemUrl;
    const response_data = await fetchURL(itemUrl);
    item.item_info = response_data;
    return item;
  });
  const updatedList = await Promise.all(itemPromises);
  return updatedList;
};

const getDaevanionData = async (
  data: any,
  lang: string,
  characterId: string,
  serverId: string,
) => {
  const boardList = data.info.daevanion.boardList;
  const itemPromises = boardList.map(async (oldItem: any) => {
    const itemUrl = `https://tw.ncsoft.com/aion2/api/character/daevanion/detail?lang=${lang}&characterId=${characterId}&serverId=${serverId}&boardId=${oldItem.id}`;
    const res_data = await fetchURL(itemUrl);
    const newItem = { ...oldItem, item_url: itemUrl, ...res_data };
    return newItem;
  });
  const updatedList = await Promise.all(itemPromises);
  // data.info.daevanion.boardList = updatedList;
  return updatedList;
};

export const getCharacterData = async (
  characterId: string,
  serverId: string,
  lang = "zh",
  onProgress?: (text: string) => void,
): Promise<CharacterProps> => {
  const report = (text: string) => onProgress?.(text);

  report("正在获取装备数据[1/5]");
  const url = `https://tw.ncsoft.com/aion2/api/character/equipment?characterId=${encodeURIComponent(characterId)}&serverId=${serverId}&lang=${lang}`;
  const data = await fetchURL(url);

  report("正在获取角色信息[2/5]");
  const infoData = await getCharacterInfoData(characterId, serverId, lang);
  data.info = infoData;

  report("正在处理装备详情[3/5]");
  const equipmentList = await getEuqipmentData(
    data.equipment.equipmentList,
    characterId,
    serverId,
    lang,
  );

  report("正在获取守护力数据技能[4/5]");
  const boardList = await getDaevanionData(data, lang, characterId, serverId);

  const CharacterData: CharacterProps = {
    characterId,
    serverId,
    updatedAt: new Date().toLocaleString(),
    profile: infoData?.profile || [],
    info: {
      equipmentList: equipmentList,
      skinList: data?.equipment?.skinList || [],
      pet: data?.petwing?.pet as Record<string, any>,
      wing: data?.petwing?.wing as Record<string, any>,
      skillList: data?.skill?.skillList || [],
      daevanion: { boardList: boardList },
      ranking: infoData?.ranking || {},
      title: infoData?.title || {},
      stat: infoData?.stat || {},
    },
    processed: {
      statEntriesMap: {},
      parts: [],
      finalScore: 0,
    },
    scores: {},
  };
  return CharacterData;
};
