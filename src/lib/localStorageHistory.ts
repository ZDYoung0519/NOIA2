import { MainActorRecord } from "@/types/aion2dps";
import { CharacterSearchResult } from "@/types/character";

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

export class GenericLocalHistory<T extends Record<string, any>> {
  private readonly storageKey: string;
  private readonly maxItems: number;
  private readonly idField: keyof T;

  constructor(storageKey: string, idField: keyof T, maxItems: number = 50) {
    this.storageKey = storageKey;
    this.idField = idField;
    this.maxItems = maxItems;
  }

  private persistWithQuotaGuard(list: T[]): void {
    let nextList = list.slice(0, this.maxItems);

    while (nextList.length > 0) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(nextList));
        return;
      } catch (error) {
        if (!isQuotaExceededError(error)) {
          throw error;
        }

        const trimmedLength =
          nextList.length <= 8 ? nextList.length - 1 : Math.floor(nextList.length * 0.75);
        nextList = nextList.slice(0, Math.max(0, trimmedLength));
      }
    }

    localStorage.removeItem(this.storageKey);
  }

  /* --------------- 基础 CRUD --------------- */

  /** 读取整条数组 */
  get(): T[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }

  /** 根据主键字段查单条 */
  getOne(idValue: string | number): T | undefined {
    const list = this.get();
    return list.find((i) => i[this.idField] === idValue);
  }

  /** 新增 or 覆盖（同主键则置顶） */
  add(item: T): void {
    const list = this.get();
    const filtered = list.filter((i) => i[this.idField] !== item[this.idField]);
    const newList = [item, ...filtered].slice(0, this.maxItems);
    this.persistWithQuotaGuard(newList);
  }

  /** 根据主键删除 */
  remove(idValue: string | number): void {
    const list = this.get();
    const filtered = list.filter((i) => i[this.idField] !== idValue);
    this.persistWithQuotaGuard(filtered);
  }

  /** 局部更新（同主键则合并字段；不存在则新增） */
  updateOne(item: Partial<T> & Pick<T, keyof T>): void {
    const list = this.get();
    const idx = list.findIndex((i) => i[this.idField] === item[this.idField]);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...item };
    } else {
      list.unshift(item as T);
    }
    const newList = list.slice(0, this.maxItems);
    this.persistWithQuotaGuard(newList);
  }

  /** 清空 */
  clear(): void {
    localStorage.removeItem(this.storageKey);
  }
}

// import { CharacterProps } from "@/types/aion2";
// import { BuildDataProps } from "@/types/aion2";
// import { CharacterSearchResult } from "@/pages/character/types";

import { HistoryTargetRecord } from "@/types/aion2dps";

// export const Aion2CharacterHistory = new GenericLocalHistory<CharacterProps>(
//   "AION2CHARACTER", // localStorage key
//   "characterId", // 主键字段
//   50, // 最大条数
// );

export const Aion2SearchHistory = new GenericLocalHistory<CharacterSearchResult>(
  "AION2CHARACTERSEARCH", // localStorage key
  "characterId", // 主键字段
  50 // 最大条数
);

// export const Aion2BUILDHistory = new GenericLocalHistory<BuildDataProps>(
//   "AION2BUILD",
//   "id",
//   5,
// );

export const Aion2DpsHistory = new GenericLocalHistory<HistoryTargetRecord>(
  "AION2DPSHISTORY", // localStorage key
  "id",
  50000
);

export const Aion2MainActorHistory = new GenericLocalHistory<MainActorRecord>(
  "AION2MainActorHistory", // localStorage key
  "id",
  20
);
