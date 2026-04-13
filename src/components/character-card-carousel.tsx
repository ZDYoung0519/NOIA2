import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Clock3,
  Server,
} from "lucide-react";

import { fetchAion2SearchAPi } from "@/lib/aion2/fetchAion2SearchAPi";
import { postFengwoPveRating } from "@/lib/aion2/fetchFengwoApi";
import { getServerShortName } from "@/lib/aion2/servers";
import { Aion2MainActorHistory } from "@/lib/localStorageHistory";
import type { CharacterSearchResult } from "@/types/character";

const cardBackgrounds = [
  "bg-[radial-gradient(circle_at_18%_88%,rgba(255,135,121,0.95),transparent_34%),radial-gradient(circle_at_55%_72%,rgba(241,84,150,0.9),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(38,108,255,0.95),transparent_22%),linear-gradient(135deg,#081126_0%,#091739_45%,#12204b_72%,#1d2152_100%)]",
  "bg-[radial-gradient(circle_at_20%_82%,rgba(105,227,196,0.75),transparent_34%),radial-gradient(circle_at_60%_26%,rgba(67,133,255,0.72),transparent_28%),radial-gradient(circle_at_78%_80%,rgba(130,97,255,0.8),transparent_24%),linear-gradient(135deg,#0a1721_0%,#102739_48%,#153b5d_76%,#23395f_100%)]",
  "bg-[radial-gradient(circle_at_24%_80%,rgba(255,174,82,0.86),transparent_32%),radial-gradient(circle_at_68%_28%,rgba(255,92,146,0.82),transparent_26%),radial-gradient(circle_at_84%_74%,rgba(96,128,255,0.8),transparent_22%),linear-gradient(135deg,#1a1327_0%,#29173b_48%,#312161_72%,#182c59_100%)]",
];

type CharacterCardState = {
  loading: boolean;
  searchResult?: CharacterSearchResult;
  pveScore?: number;
  error?: string;
};

function formatLastSeen(lastSeenAt: number) {
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) {
    return "--";
  }

  return new Date(lastSeenAt).toLocaleString();
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "NA";
  return trimmed.slice(0, 2).toUpperCase();
}

function formatScore(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return Math.round(value).toLocaleString();
}

function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-white/15 ${className}`} />;
}

export default function CharacterCardCarousel() {
  const cards = React.useMemo(
    () =>
      Aion2MainActorHistory.get()
        .slice()
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    []
  );

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [cardStateMap, setCardStateMap] = React.useState<Record<string, CharacterCardState>>({});
  const [failedImageIds, setFailedImageIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (cards.length === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((prevIndex) => Math.min(prevIndex, cards.length - 1));
  }, [cards.length]);

  React.useEffect(() => {
    let cancelled = false;

    const loadCards = async () => {
      const nextEntries = Object.fromEntries(
        cards.map((card) => [
          card.id,
          {
            loading: true,
            searchResult: cardStateMap[card.id]?.searchResult,
            pveScore: cardStateMap[card.id]?.pveScore,
            error: undefined,
          } satisfies CharacterCardState,
        ])
      );

      setCardStateMap((current) => ({ ...current, ...nextEntries }));

      await Promise.all(
        cards.map(async (card) => {
          try {
            const searchResults = await fetchAion2SearchAPi(
              card.actorName,
              "",
              String(card.serverId)
            );

            const matchedResult =
              searchResults.find(
                (item) =>
                  item.name.trim() === card.actorName.trim() &&
                  Number(item.serverId) === Number(card.serverId)
              ) ?? searchResults[0];

            const fengwoResult = await postFengwoPveRating({
              characters: [
                {
                  characterName: card.actorName,
                  serverId: card.serverId,
                },
              ],
            });

            const pveScore = fengwoResult?.results?.[0]?.pveScore;

            if (cancelled) return;

            setCardStateMap((current) => ({
              ...current,
              [card.id]: {
                loading: false,
                searchResult: matchedResult,
                pveScore: typeof pveScore === "number" ? pveScore : undefined,
                error: undefined,
              },
            }));
          } catch (error) {
            if (cancelled) return;

            setCardStateMap((current) => ({
              ...current,
              [card.id]: {
                loading: false,
                searchResult: current[card.id]?.searchResult,
                pveScore: current[card.id]?.pveScore,
                error: error instanceof Error ? error.message : "Failed to load character",
              },
            }));
          }
        })
      );
    };

    if (cards.length > 0) {
      void loadCards();
    }

    return () => {
      cancelled = true;
    };
  }, [cards]);

  const prev = () => {
    if (cards.length === 0) return;
    setActiveIndex((prevIndex) => (prevIndex === 0 ? cards.length - 1 : prevIndex - 1));
  };

  const next = () => {
    if (cards.length === 0) return;
    setActiveIndex((prevIndex) => (prevIndex === cards.length - 1 ? 0 : prevIndex + 1));
  };

  if (cards.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-border/50 bg-muted/35 text-sm text-muted-foreground">
        No recent characters
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative h-[360px] w-full overflow-hidden sm:h-[380px] lg:h-[400px]">
        {cards.map((card, index) => {
          const rawOffset = index - activeIndex;
          const wrappedOffset =
            rawOffset > cards.length / 2
              ? rawOffset - cards.length
              : rawOffset < -cards.length / 2
              ? rawOffset + cards.length
              : rawOffset;

          const isActive = wrappedOffset === 0;
          const isHidden = Math.abs(wrappedOffset) > 2;

          let placement = "";
          if (isActive) {
            placement =
              "z-30 translate-x-[-50%] scale-100 opacity-100 blur-0";
          } else if (wrappedOffset === -1) {
            placement =
              "z-20 translate-x-[calc(-50%-38%)] scale-[0.9] opacity-70 blur-[0.2px]";
          } else if (wrappedOffset === 1) {
            placement =
              "z-20 translate-x-[calc(-50%+38%)] scale-[0.9] opacity-70 blur-[0.2px]";
          } else if (wrappedOffset === -2) {
            placement =
              "z-10 translate-x-[calc(-50%-54%)] scale-[0.82] opacity-30 blur-[0.6px]";
          } else if (wrappedOffset === 2) {
            placement =
              "z-10 translate-x-[calc(-50%+54%)] scale-[0.82] opacity-30 blur-[0.6px]";
          } else {
            placement = "z-0 translate-x-[-50%] scale-[0.78] opacity-0 pointer-events-none";
          }

          const state = cardStateMap[card.id];
          const loading = state?.loading ?? true;
          const searchResult = state?.searchResult;
          const serverName = getServerShortName(card.serverId) || String(card.serverId);
          const colors = cardBackgrounds[index % cardBackgrounds.length];
          const avatarUrl = searchResult?.profileImageUrl;
          const avatarFailed = Boolean(failedImageIds[card.id]);
          const pveScore = state?.pveScore;

          return (
            <div
              key={card.id}
              className={`absolute left-1/2 top-0 h-full w-[86%] max-w-[780px] origin-center transition-all duration-500 ease-out sm:w-[78%] ${placement} hover:brightness-115`}
              aria-hidden={isHidden}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveIndex(index);
                  }
                }}
                className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[32px] border border-white/10 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] outline-none  sm:p-6 lg:p-7 ${colors}`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_36%,rgba(0,0,0,0.12)_100%)]" />

                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-3">
                      <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/75 ">
                        RECENT CHARACTER
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/12 text-sm font-semibold sm:h-16 sm:w-16">
                            {loading ? (
                              <LoadingBlock className="h-full w-full rounded-none" />
                            ) : avatarUrl && !avatarFailed ? (
                              <img
                                src={avatarUrl}
                                alt={card.actorName}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={() => {
                                  setFailedImageIds((current) => ({
                                    ...current,
                                    [card.id]: true,
                                  }));
                                }}
                              />
                            ) : (
                              <span>{getInitials(card.actorName)}</span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <h2 className="truncate text-[24px] font-semibold tracking-tight sm:text-[28px] lg:text-[32px]">
                              {card.actorName}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ">
                                <Server className="h-3.5 w-3.5" />
                                {serverName}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/15"
                      title="Open character page"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                    <div className="rounded-3xl bg-white/10 p-4  backdrop-blur-sm lg:p-5">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
                        <Sparkles className="h-3.5 w-3.5" />
                        PVE Score
                      </div>
                      <div className="mt-3 text-[34px] font-semibold leading-none lg:text-[40px]">
                        {loading ? <LoadingBlock className="h-10 w-28" /> : formatScore(pveScore)}
                      </div>
                      <p className="mt-2 text-xs text-white/55">Current combat rating snapshot</p>
                    </div>

                    <div className="rounded-3xl bg-white/10 p-4  backdrop-blur-sm lg:p-5">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
                        <Clock3 className="h-3.5 w-3.5" />
                        Last Game Time
                      </div>
                      <div className="mt-3 text-base font-medium leading-6 text-white/95 lg:text-lg">
                        {formatLastSeen(card.lastSeenAt)}
                      </div>
                      <p className="mt-2 text-xs text-white/55">Most recent local history record</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                    <div className="flex items-center gap-2 text-sm text-white/65">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                      Synced from recent searches
                    </div>

                    <div className="rounded-full bg-black/15 px-3 py-1.5 text-xs text-white/70 ">
                      {index + 1} / {cards.length}
                    </div>
                  </div>

                  {state?.error && (
                    <div className="mt-3 text-sm text-rose-100/90">Profile load failed</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-y-0 left-2 z-40 flex items-center sm:left-4">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={prev}
            className="pointer-events-auto h-10 w-10 rounded-full border border-border/50 bg-background/80 shadow-sm backdrop-blur hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-2 z-40 flex items-center sm:right-4">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={next}
            className="pointer-events-auto h-10 w-10 rounded-full border border-border/50 bg-background/80 shadow-sm backdrop-blur hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`transition-all ${
              index === activeIndex
                ? "h-2.5 w-8 rounded-full bg-primary"
                : "h-2.5 w-2.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
            aria-label={`Go to card ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
