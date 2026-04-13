import { fetchURL } from "../fetch";

export type NoiaCharacter = {
  characterName: string;
  serverId: number;
};

export type NoiaPveRatingRequest = {
  characters: NoiaCharacter[];
};

export const FENGWO_BASE = "https://aion-api.bnshive.com/";
export const FENGWO_API_KEY =
  "noia_e8ff4d2538660a1d218b5f61013e7b2a3ef312cbed9bca758c0116cdf2fa68b2";

export const postFengwoPveRating = async (payload: NoiaPveRatingRequest) => {
  const url = `${FENGWO_BASE}partner/noia/pve-rating`;
  return fetchURL(url, {
    method: "POST",
    headers: [
      ["x-api-key", FENGWO_API_KEY],
      ["User-Agent", "Tauri App"],
    ],
    body: payload,
  });
};
