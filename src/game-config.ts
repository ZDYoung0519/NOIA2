import { Home, LineChart, ShieldCheck, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  activePaths?: string[];
};

export type GameConfig = {
  id: string;
  name: string;
  rootPath: string;
  navItems: NavItem[];
  bgVideo?: string;
  bgImage?: string;
};

export const AION2_GAME: GameConfig = {
  id: "aion2",
  name: "AION2",
  rootPath: "/aion2",
  navItems: [
    { label: "首页", path: "/aion2", icon: Home },
    {
      label: "角色查询",
      path: "/aion2/character/search",
      icon: ShieldCheck,
      activePaths: ["/aion2/character/search", "/aion2/character/view"],
    },
    { label: "伤害排行", path: "/aion2/dps-rank", icon: LineChart },
    // { label: "职业统计", path: "/aion2/dps-class-stats", icon: BarChart3 },
  ],

  bgVideo: "/aion2/bg.mp4",
  bgImage: "/aion2/background.png",
};

export const POE2_GAME: GameConfig = {
  id: "poe2",
  name: "流放之路2",
  rootPath: "/poe2",
  navItems: [
    { label: "首页", path: "/poe2", icon: Home },
    // { label: "装备查询", path: "/poe2/items", icon: ShieldCheck },
    // { label: "天赋树", path: "/poe2/tree", icon: LineChart },
    // { label: "市场", path: "/poe2/market", icon: BarChart3 },
  ],
  bgVideo: "/poe2/bg.mp4",
  bgImage: "/poe2/wraeclast.webp",
};

export const ALL_GAMES: GameConfig[] = [AION2_GAME];

export function getGameByPath(pathname: string): GameConfig | undefined {
  return ALL_GAMES.find((g) => pathname.startsWith(g.rootPath)) ?? ALL_GAMES[0];
}
