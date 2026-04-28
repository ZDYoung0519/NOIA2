export interface CharacterSearchResult {
  characterName: string;
  characterId: string;
  serverId: string;
  serverName: string;
  raceId: number;
  raceName: string;
  className: string;
  profileImageUrl: string;
}

export interface CharacterProps {
  characterId: string;
  fetchedAt: string;
  data: {
    profile: Record<string, any>;
    statList: Record<string, any>[];
    equipmentList: any[];
    equipmentDetailList: any[];
    daevanionDetails: {
      boardId: number;
      boardName: number;
      detail: {
        openStatEffectList: {
          desc: string;
        }[];
        openSkillEffectList: {
          desc: string;
        }[];
      };
    }[];
    activeNodes: { boardId: number; nodeId: number }[];
    skillList: {
      id: number;
      name: number;
      needLevel: number;
      skillLevel: number;
      icon: string;
      category: string;
      acquired: string;
      equip: string;
    }[];
    petwing: Record<string, any>;
    ranking: {
      rankingList: Record<string, any>[];
    };

    title: {
      totalCount: number;
      ownedCount: number;
      titleList: {
        id: number;
        equipCategory: string;
        name: string;
        grade: string;
        totalCount: 148;
        ownedCount: 89;
        ownedPercent: 60;
        statList: { desc: string }[];
        equipStatList: { desc: string }[];
      }[];
    };
  };
}
