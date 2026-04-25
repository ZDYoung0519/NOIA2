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
  serverId: number;
  updatedAt: string;
  profile: {
    pcId: number;
    gender: number;
    raceId: number;
    titleId: number;
    raceName: string;
    serverId: number;
    className: string;
    titleName: string;
    genderName: string;
    regionName: string;
    serverName: string;
    titleGrade: string;
    characterId: string;
    profileImage: string;
    characterName: string;
    characterLevel: string;
  };
  info: {
    equipmentList: any[];
    skinList: any[];
    pet: Record<string, any>;
    wing: Record<string, any>;
    skillList: any[];
    daevanion: any;
    ranking: Record<string, any>;
    title: Record<string, any>;
    stat: Record<string, any>;
  };
  processed: {
    statEntriesMap: Record<string, any[]>;
    parts: Array<{ name: string; value: number; details: string[] }>;
    statsProfile: Record<string, any>;
    finalScore: Number;
  };
  scores: Record<string, number>;
}
