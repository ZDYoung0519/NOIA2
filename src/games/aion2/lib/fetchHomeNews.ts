import { fetchURL } from "@/lib/fetch";

export type Aion2Event = {
  id: number;
  title: string;
  url: string;
  image?: string;
  startAt: string;
  endAt: string;
};

export type Aion2BoardArticle = {
  id: number;
  title: string;
  url: string;
  date: string;
};

export type HomeNewsData = {
  events: Aion2Event[];
  notices: Aion2BoardArticle[];
  updates: Aion2BoardArticle[];
};

const EVENTS_API =
  "https://promotion.plaync.com/eventon/item?tag=MKT_PROMOTION%2CDOMAIN_AION2_TW%2C%2C&status=RUNNING";
const COMMUNITY_API_BASE = "https://api-tw-community.ncsoft.com/aion2_tw/board";
const NOTICE_API =
  `${COMMUNITY_API_BASE}/notice_zh/article/search/moreArticle` +
  "?isVote=true&moreSize=18&moreDirection=BEFORE&previousArticleId=0";
const UPDATE_API =
  `${COMMUNITY_API_BASE}/update_zh/article/search/moreArticle` +
  "?isVote=true&moreSize=18&moreDirection=BEFORE&previousArticleId=0";

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function formatMonthDay(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function cleanEventTitle(title: unknown) {
  return typeof title === "string" ? title.replace(/^\[[^\]]+\]\s*/, "").trim() : "";
}

function getEventImage(item: any) {
  const additionSet = asArray(item?.marketingItemAdditionSet);
  const findAddition = (additionType: string) =>
    additionSet.find((entry: any) => entry?.additionType === additionType)?.additionData;

  return pickFirstString(
    findAddition("eventListImgUrl"),
    findAddition("eventListSmallImgUrl"),
    findAddition("snsImgUrl")
  );
}

function getEventUrl(item: any) {
  const entrySet = asArray(item?.marketingEntrySet);
  const normalEntry = entrySet.find((entry: any) => entry?.entryDevice === "NORMAL");

  return pickFirstString(normalEntry?.entryUrl, entrySet[0]?.entryUrl);
}

function normalizeBoardArticleList(payload: any) {
  return asArray(
    payload?.contentList ??
      payload?.list ??
      payload?.content ??
      payload?.data ??
      payload?.articleList ??
      payload
  );
}

function buildBoardArticleUrl(item: any, boardKey: "notice" | "update", articleId: number) {
  const boardUrlPattern =
    item?.rootBoard?.board?.boardUrlPattern ??
    item?.categoryBoard?.boardUrlPattern ??
    item?.board?.boardUrlPattern;

  if (typeof boardUrlPattern === "string" && boardUrlPattern.includes("{articleId}")) {
    return boardUrlPattern.replace("{articleId}", String(articleId));
  }

  return `https://tw.ncsoft.com/aion2/board/${boardKey}/view?articleId=${articleId}`;
}

function resolveBoardArticleId(item: any) {
  const candidates = [
    item?.articleId,
    item?.snow?.contentId,
    item?.boardArticleId,
    item?.article?.articleId,
    item?.id,
  ];

  for (const candidate of candidates) {
    const numericId =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string" && /^\d+$/.test(candidate)
          ? Number(candidate)
          : NaN;

    if (Number.isFinite(numericId) && numericId > 0) {
      return numericId;
    }
  }

  return 0;
}

export async function fetchAion2Events(limit = 10): Promise<Aion2Event[]> {
  const payload = await fetchURL(`${EVENTS_API}&pageSize=${limit}&page=1`);
  const items = asArray(payload?.content);

  return items.map((item: any) => ({
    id: Number(item?.idx ?? 0),
    title: cleanEventTitle(item?.itemTitle),
    url: getEventUrl(item),
    image: getEventImage(item) || undefined,
    startAt: pickFirstString(item?.itemStart),
    endAt: pickFirstString(item?.itemEnd),
  }));
}

async function fetchBoardArticles(
  endpoint: string,
  boardKey: "notice" | "update"
): Promise<Aion2BoardArticle[]> {
  const payload = await fetchURL(endpoint);

  return normalizeBoardArticleList(payload)
    .map((item: any) => {
      const id = resolveBoardArticleId(item);
      const title = pickFirstString(item?.title, item?.subject, item?.articleTitle);

      if (!id || !title) {
        return null;
      }

      return {
        id,
        title,
        date: formatMonthDay(
          item?.timestamps?.postedAt ??
            item?.timestamps?.publishedAt ??
            item?.exposureStartDate ??
            item?.createDate ??
            item?.createdDate ??
            item?.createdAt ??
            item?.regDate
        ),
        url: buildBoardArticleUrl(item, boardKey, id),
      };
    })
    .filter((item: Aion2BoardArticle | null): item is Aion2BoardArticle => Boolean(item));
}

export async function fetchHomeNewsData(): Promise<HomeNewsData> {
  const [events, notices, updates] = await Promise.all([
    fetchAion2Events(10),
    fetchBoardArticles(NOTICE_API, "notice"),
    fetchBoardArticles(UPDATE_API, "update"),
  ]);

  return { events, notices, updates };
}
