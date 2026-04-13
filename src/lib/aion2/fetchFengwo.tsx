import { fetchURL } from "@/lib/fetch";

export const fetchFengwo = async (
  characterName: string,
  serverName: string,
) => {
  const params = new URLSearchParams({
    name: characterName,
    server: serverName,
  });

  const url = `https://aion-api.bnshive.com/character/query?${params.toString()}`;
  return fetchURL(url, {
    method: "GET",
  });
};
