import { CharacterProps } from "@/types/character";
import { fetchURL } from "@/lib/fetch";
import { postFengwoPveRating } from "./fetchFengwoApi";

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

// const getEuqipmentData = async (
//   equipmentList: any,
//   characterId: string,
//   serverId: string,
//   lang: string,
// ) => {
//   const itemPromises = equipmentList.map(async (item: any) => {
//     const itemUrl = `https://tw.ncsoft.com/aion2/api/character/equipment/item?id=${
//       item.id
//     }&enchantLevel=${
//       item.enchantLevel + item.exceedLevel
//     }&characterId=${characterId}&serverId=${serverId}&slotPos=${
//       item.slotPos
//     }&lang=${lang}`;
//     item.item_info = {};
//     item.item_info.url = itemUrl;
//     const response_data = await fetchURL(itemUrl);
//     item.item_info = response_data;
//     return item;
//   });
//   const updatedList = await Promise.all(itemPromises);
//   return updatedList;
// };

// const getDaevanionData = async (
//   data: any,
//   lang: string,
//   characterId: string,
//   serverId: string,
// ) => {
//   const boardList = data.info.daevanion.boardList;
//   const itemPromises = boardList.map(async (oldItem: any) => {
//     const itemUrl = `https://tw.ncsoft.com/aion2/api/character/daevanion/detail?lang=${lang}&characterId=${characterId}&serverId=${serverId}&boardId=${oldItem.id}`;
//     const res_data = await fetchURL(itemUrl);
//     const newItem = { ...oldItem, item_url: itemUrl, ...res_data };
//     return newItem;
//   });
//   const updatedList = await Promise.all(itemPromises);
//   // data.info.daevanion.boardList = updatedList;
//   return updatedList;
// };

export const getCharacterPreview = async (
  characterId: string,
  serverId: number,
  lang = "zh",
): Promise<CharacterProps> => {
  const url = `https://tw.ncsoft.com/aion2/api/character/equipment?characterId=${encodeURIComponent(characterId)}&serverId=${serverId}&lang=${lang}`;
  const data = await fetchURL(url);
  const infoData = await getCharacterInfoData(
    characterId,
    serverId.toString(),
    lang,
  );

  const params = {
    characters: [
      {
        characterName: infoData?.profile?.characterName,
        serverId: serverId,
      },
    ],
  };
  const fengwoPveResults = await postFengwoPveRating(params);
  const fengwoPveScore = fengwoPveResults?.results[0].pveScore;
  const combatPower = infoData?.profile?.combatPower;
  const itemLevel = infoData?.stat?.statList?.find(
    (item: { type: string; value: number }) => item.type === "ItemLevel",
  )?.value;

  const CharacterData: CharacterProps = {
    characterId,
    serverId,
    updatedAt: new Date().toLocaleString(),
    profile: infoData?.profile || [],
    info: {
      equipmentList: data.equipment.equipmentList,
      skinList: data.equipment.skinList || [],
      pet: data?.petwing?.pet as Record<string, any>,
      wing: data?.petwing?.wing as Record<string, any>,
      skillList: data?.skill?.skillList || [],
      daevanion: { boardList: [] },
      ranking: infoData?.ranking || {},
      title: infoData?.title || {},
      stat: infoData?.stat || {},
    },
    processed: {
      statEntriesMap: {},
      parts: [],
      finalScore: 0,
      statsProfile: {} as Record<string, number>,
    },
    scores: {
      fengwoPveScore: fengwoPveScore,
      itemLevel: itemLevel,
      combatPower: combatPower,
    },
  };
  return CharacterData;
};


