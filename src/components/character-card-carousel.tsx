import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Server,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchFengwo } from "@/lib/aion2/fetchFengwo";
import { getServerShortName } from "@/lib/aion2/servers";
import { Aion2MainActorHistory } from "@/lib/localStorageHistory";

const cardBackgrounds = [
  "bg-[radial-gradient(circle_at_18%_88%,rgba(255,135,121,0.95),transparent_34%),radial-gradient(circle_at_55%_72%,rgba(241,84,150,0.9),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(38,108,255,0.95),transparent_22%),linear-gradient(135deg,#081126_0%,#091739_45%,#12204b_72%,#1d2152_100%)]",
  "bg-[radial-gradient(circle_at_20%_82%,rgba(105,227,196,0.75),transparent_34%),radial-gradient(circle_at_60%_26%,rgba(67,133,255,0.72),transparent_28%),radial-gradient(circle_at_78%_80%,rgba(130,97,255,0.8),transparent_24%),linear-gradient(135deg,#0a1721_0%,#102739_48%,#153b5d_76%,#23395f_100%)]",
  "bg-[radial-gradient(circle_at_24%_80%,rgba(255,174,82,0.86),transparent_32%),radial-gradient(circle_at_68%_28%,rgba(255,92,146,0.82),transparent_26%),radial-gradient(circle_at_84%_74%,rgba(96,128,255,0.8),transparent_22%),linear-gradient(135deg,#1a1327_0%,#29173b_48%,#312161_72%,#182c59_100%)]",
];

type MainActorCard = ReturnType<typeof Aion2MainActorHistory.get>[number];

type FengwoResult = {
  queryResult?: {
    data?: {
      profile?: {
        profileImage?: string;
        className?: string;
        combatPower?: number;
      };
      stat?: {
        statList?: { type: string; value: number }[];
      };
    };
  };
  rating?: {
    scores?: {
      score?: number;
    };
  };
  [key: string]: unknown;
};

type CharacterCardState = {
  loading: boolean;
  result?: FengwoResult;
  error?: string;
};

type CarouselCardProps = {
  card: MainActorCard;
  index: number;
  total: number;
  activeIndex: number;
  state?: CharacterCardState;
  backgroundClass: string;
  failedImage: boolean;
  onActivate: (index: number) => void;
  onImageError: (id: string) => void;
};

function formatLastSeen(lastSeenAt: number) {
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) {
    return "--";
  }

  return new Date(lastSeenAt).toLocaleString();
}

function getInitials(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "NA";
}

function formatScore(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toLocaleString()
    : "--";
}

function getPlacementClass(wrappedOffset: number) {
  if (wrappedOffset === 0) {
    return "z-30 translate-x-[-50%] scale-100 opacity-100 blur-0";
  }
  if (wrappedOffset === -1) {
    return "z-20 translate-x-[calc(-50%-38%)] scale-[0.9] opacity-70 blur-[0.2px]";
  }
  if (wrappedOffset === 1) {
    return "z-20 translate-x-[calc(-50%+38%)] scale-[0.9] opacity-70 blur-[0.2px]";
  }
  if (wrappedOffset === -2) {
    return "z-10 translate-x-[calc(-50%-54%)] scale-[0.82] opacity-30 blur-[0.6px]";
  }
  if (wrappedOffset === 2) {
    return "z-10 translate-x-[calc(-50%+54%)] scale-[0.82] opacity-30 blur-[0.6px]";
  }
  return "z-0 translate-x-[-50%] scale-[0.78] opacity-0 pointer-events-none";
}

function normalizeWrappedOffset(rawOffset: number, total: number) {
  if (rawOffset > total / 2) return rawOffset - total;
  if (rawOffset < -total / 2) return rawOffset + total;
  return rawOffset;
}

function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-white/15 ${className}`} />;
}

const CarouselCard = React.memo(function CarouselCard({
  card,
  index,
  total,
  activeIndex,
  state,
  backgroundClass,
  failedImage,
  onActivate,
  onImageError,
}: CarouselCardProps) {
  const wrappedOffset = normalizeWrappedOffset(index - activeIndex, total);
  const isHidden = Math.abs(wrappedOffset) > 2;
  const placementClass = getPlacementClass(wrappedOffset);
  const loading = state?.loading ?? true;
  const result = state?.result;
  const serverName = getServerShortName(card.serverId) || String(card.serverId);
  const avatarUrl = result?.queryResult?.data?.profile?.profileImage;
  const actorClass = result?.queryResult?.data?.profile?.className;
  const statList = result?.queryResult?.data?.stat?.statList;
  const itemLevel = statList?.find((item) => item?.type === "ItemLevel")?.value;
  const combatPower = result?.queryResult?.data?.profile?.combatPower;
  const fengwoScore = result?.rating?.scores?.score;

  return (
    <div
      className={`absolute left-1/2 top-0 h-full w-[86%] max-w-[780px] origin-center transition-all duration-500 ease-out sm:w-[78%] ${placementClass} hover:brightness-115`}
      aria-hidden={isHidden}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onActivate(index)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate(index);
          }
        }}
        className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[32px] border border-white/10 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] outline-none sm:p-6 lg:p-7 ${backgroundClass}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_36%,rgba(0,0,0,0.12)_100%)]" />

        <div className="relative flex h-full flex-col">
          <div className="flex items-start">
            <div className="min-w-0 space-y-3">
              <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/75">
                RECENT CHARACTER
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/12 text-sm font-semibold sm:h-16 sm:w-16">
                    {loading ? (
                      <LoadingBlock className="h-full w-full rounded-none" />
                    ) : avatarUrl && !failedImage ? (
                      <img
                        src={avatarUrl}
                        alt={card.actorName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => onImageError(card.id)}
                      />
                    ) : (
                      <span>{getInitials(card.actorName)}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[24px] font-semibold tracking-tight sm:text-[28px] lg:text-[32px]">
                        {card.actorName}
                      </h2>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-sm text-white/75">
                        <Server className="h-3.5 w-3.5" />
                        {serverName}
                      </span>
                      {actorClass ? (
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-sm text-white/75">
                          {actorClass}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
                        <img
                          src="/images/aion2/profile_level_icon_pc.png"
                          alt="Item level"
                          className="h-5 w-4"
                        />
                        <span className="text-sm font-semibold text-white">
                          {itemLevel ?? "--"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
                        <img
                          src="/images/aion2/profile_power_icon_pc.png"
                          alt="Combat power"
                          className="h-5 w-5"
                        />
                        <span className="text-sm font-semibold text-white">
                          {typeof combatPower === "number"
                            ? (combatPower / 1000).toFixed(2)
                            : "--"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
                        <img
                          src="/images/aion2/fengwo.png"
                          alt="Fengwo score"
                          className="h-5 w-5"
                        />
                        <span className="text-sm font-semibold text-white">
                          {typeof fengwoScore === "number"
                            ? fengwoScore.toFixed(0)
                            : "--"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <button
            type="button"
            className="absolute right-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/15"
            title="Open character page"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          <div className="mt-auto flex items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-2 text-sm text-white/65">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
              Synced from recent searches
            </div>

            <div className="rounded-full bg-black/15 px-3 py-1.5 text-xs text-white/70">
              {index + 1} / {total}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/70">
            <div className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {formatLastSeen(card.lastSeenAt)}
            </div>
            {state?.error ? (
              <div className="text-rose-100/90">Profile load failed</div>
            ) : (
              <div className="inline-flex items-center gap-2 text-white/60">
                <Sparkles className="h-4 w-4" />
                Score {loading ? "--" : formatScore(fengwoScore)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default function CharacterCardCarousel() {
  const cards = React.useMemo(
    () =>
      Aion2MainActorHistory.get()
        .slice()
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    []
  );

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [cardStateMap, setCardStateMap] = React.useState<
    Record<string, CharacterCardState>
  >({});
  const [failedImageIds, setFailedImageIds] = React.useState<
    Record<string, boolean>
  >({});

  React.useEffect(() => {
    if (cards.length === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, cards.length - 1));
  }, [cards.length]);

  React.useEffect(() => {
    let cancelled = false;

    const markAllLoading = () => {
      setCardStateMap((current) => {
        const next = { ...current };
        for (const card of cards) {
          next[card.id] = {
            loading: true,
            result: current[card.id]?.result,
            error: undefined,
          };
        }
        return next;
      });
    };

    const loadCard = async (card: MainActorCard) => {
      try {
        const result = await fetchFengwo(
          card.actorName,
          getServerShortName(card.serverId)
        );
        if (cancelled) return;

        setCardStateMap((current) => ({
          ...current,
          [card.id]: {
            loading: false,
            result,
          },
        }));
      } catch (error) {
        if (cancelled) return;

        setCardStateMap((current) => ({
          ...current,
          [card.id]: {
            loading: false,
            result: current[card.id]?.result,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load character",
          },
        }));
      }
    };

    if (cards.length > 0) {
      markAllLoading();
      void Promise.all(cards.map(loadCard));
    }

    return () => {
      cancelled = true;
    };
  }, [cards]);

  const prev = React.useCallback(() => {
    if (cards.length === 0) return;
    setActiveIndex((current) => (current === 0 ? cards.length - 1 : current - 1));
  }, [cards.length]);

  const next = React.useCallback(() => {
    if (cards.length === 0) return;
    setActiveIndex((current) => (current === cards.length - 1 ? 0 : current + 1));
  }, [cards.length]);

  const markImageFailed = React.useCallback((id: string) => {
    setFailedImageIds((current) => ({ ...current, [id]: true }));
  }, []);

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
        {cards.map((card, index) => (
          <CarouselCard
            key={card.id}
            card={card}
            index={index}
            total={cards.length}
            activeIndex={activeIndex}
            state={cardStateMap[card.id]}
            backgroundClass={cardBackgrounds[index % cardBackgrounds.length]}
            failedImage={Boolean(failedImageIds[card.id])}
            onActivate={setActiveIndex}
            onImageError={markImageFailed}
          />
        ))}

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
