import { supabase } from "@/lib/supabase";

export type HomeAnnouncement = {
  id: string;
  title: string;
  badge: string;
  message: string;
  updatedAt?: string | null;
};

export const DEFAULT_HOME_ANNOUNCEMENT: HomeAnnouncement = {
  id: "local-default",
  title: "Notice",
  badge: "今日提示",
  message:
    "新版本建议先在菜单中运行抓包驱动诊断；若 Buff 或 DPS 显示异常，请重启悬浮窗后再进入副本。",
};

const HOME_ANNOUNCEMENT_CACHE_KEY = "aion2-home-announcement-cache:v1";
const HOME_ANNOUNCEMENT_CACHE_TTL_MS = 30 * 60 * 1000;

type HomeAnnouncementRow = {
  id: string;
  title: string | null;
  badge: string | null;
  message: string | null;
  updated_at: string | null;
};

export async function fetchHomeAnnouncement(): Promise<HomeAnnouncement | null> {
  const cached = readHomeAnnouncementCache();
  if (cached !== undefined) {
    return cached;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("aion2_home_announcements")
    .select("id,title,badge,message,updated_at")
    .eq("enabled", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<HomeAnnouncementRow>();

  if (error) {
    console.warn("[aion2-home] fetch announcement failed:", error);
    writeHomeAnnouncementCache(DEFAULT_HOME_ANNOUNCEMENT);
    return DEFAULT_HOME_ANNOUNCEMENT;
  }

  const message = data?.message?.trim();
  if (!data || !message) {
    writeHomeAnnouncementCache(null);
    return null;
  }

  const announcement = {
    id: data.id,
    title: data.title?.trim() || "Notice",
    badge: data.badge?.trim() || "今日提示",
    message,
    updatedAt: data.updated_at,
  };
  writeHomeAnnouncementCache(announcement);
  return announcement;
}

function readHomeAnnouncementCache(): HomeAnnouncement | null | undefined {
  try {
    const raw = localStorage.getItem(HOME_ANNOUNCEMENT_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as {
      cachedAt?: number;
      announcement?: HomeAnnouncement | null;
    };
    if (
      typeof cached.cachedAt === "number" &&
      Date.now() - cached.cachedAt < HOME_ANNOUNCEMENT_CACHE_TTL_MS
    ) {
      return cached.announcement ?? null;
    }
  } catch (_) {
    /* ignore invalid cache */
  }
  return undefined;
}

function writeHomeAnnouncementCache(announcement: HomeAnnouncement | null) {
  try {
    localStorage.setItem(
      HOME_ANNOUNCEMENT_CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        announcement,
      })
    );
  } catch (_) {
    /* ignore cache write errors */
  }
}
