import serversData from "@/data/servers.json";

// 类型定义
interface Server {
  raceId: number;
  serverId: number;
  serverName: string;
  serverShortName: string;
}

// 类型断言
const servers: Server[] = serversData;

// 创建 Map 缓存以提高查找性能
const serverMap = new Map<number, Server>();
servers.forEach((server) => {
  serverMap.set(server.serverId, server);
});

// 按种族分组的服务器
const serversByRace = servers.reduce<Record<number, Server[]>>(
  (acc, server) => {
    if (!acc[server.raceId]) {
      acc[server.raceId] = [];
    }
    acc[server.raceId].push(server);
    return acc;
  },
  {},
);

/**
 * 根据服务器ID获取服务器名称
 * @param serverId 服务器ID
 * @returns 服务器名称，如果未找到则返回 '未知服务器'
 */
export const getServerName = (serverId: number): string => {
  const server = serverMap.get(serverId);
  return server?.serverName || "未知服务器";
};

/**
 * 根据服务器ID获取服务器简称
 * @param serverId 服务器ID
 * @returns 服务器简称，如果未找到则返回 '未知'
 */
export const getServerShortName = (serverId: number): string => {
  const server = serverMap.get(serverId);
  return server?.serverShortName || "未知";
};

/**
 * 获取所有服务器列表
 * @returns 所有服务器的数组
 */
export const getAllServers = (): Server[] => {
  return servers;
};

/**
 * 根据种族ID获取该种族下的所有服务器
 * @param raceId 种族ID (1: 天族, 2: 魔族)
 * @returns 服务器列表，如果没有找到则返回空数组
 */
export const getRaceServers = (raceId: number): Server[] => {
  return serversByRace[raceId] || [];
};

/**
 * 根据服务器ID获取完整的服务器信息
 * @param serverId 服务器ID
 * @returns 服务器对象，如果未找到则返回 undefined
 */
export const getServerById = (serverId: number): Server | undefined => {
  return serverMap.get(serverId);
};

/**
 * 获取所有可用的种族ID
 * @returns 种族ID数组
 */
export const getRaceIds = (): number[] => {
  return Object.keys(serversByRace).map(Number).sort();
};

/**
 * 获取服务器总数
 * @returns 服务器总数
 */
export const getServerCount = (): number => {
  return servers.length;
};

/**
 * 获取指定种族的服务器数量
 * @param raceId 种族ID
 * @returns 服务器数量
 */
export const getRaceServerCount = (raceId: number): number => {
  return serversByRace[raceId]?.length || 0;
};

/**
 * 检查服务器ID是否存在
 * @param serverId 服务器ID
 * @returns 是否存在
 */
export const hasServer = (serverId: number): boolean => {
  return serverMap.has(serverId);
};

/**
 * 根据服务器名称模糊搜索服务器
 * @param keyword 搜索关键词
 * @returns 匹配的服务器列表
 */
export const searchServersByName = (keyword: string): Server[] => {
  if (!keyword) return [];
  const lowerKeyword = keyword.toLowerCase();
  return servers.filter(
    (server) =>
      server.serverName.toLowerCase().includes(lowerKeyword) ||
      server.serverShortName.toLowerCase().includes(lowerKeyword),
  );
};

/**
 * 批量获取服务器名称
 * @param serverIds 服务器ID数组
 * @returns 服务器名称数组
 */
export const getServerNames = (serverIds: number[]): string[] => {
  return serverIds.map((id) => getServerName(id));
};

/**
 * 获取服务器选项列表（用于下拉选择器）
 * @param raceId 可选，指定种族ID
 * @returns 选项数组 [{ value: serverId, label: serverName }]
 */
export const getServerOptions = (
  raceId?: number,
): Array<{ value: number; label: string; shortName: string }> => {
  const targetServers = raceId ? getRaceServers(raceId) : servers;
  return targetServers.map((server) => ({
    value: server.serverId,
    label: server.serverName,
    shortName: server.serverShortName,
  }));
};

// 导出常量
export const RACE_NAMES: Record<number, string> = {
  1: "天族",
  2: "魔族",
};

export const getRaceName = (raceId: number): string => {
  return RACE_NAMES[raceId] || "未知种族";
};
