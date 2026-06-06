import { useEffect, useState } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCcw } from "lucide-react";

import {
  fetchHomeNewsData,
  type Aion2BoardArticle,
  type HomeNewsData,
} from "@/lib/aion2/fetchHomeNews";

type NewsSlide = {
  title: string;
  subtitle: string;
  image: string;
  href: string;
};

type ActiveTab = "notice" | "update";

type HomeNewsState = {
  loading: boolean;
  data: HomeNewsData;
};

const EMPTY_HOME_NEWS_DATA: HomeNewsData = {
  events: [],
  notices: [],
  updates: [],
};

const loadedImageUrls = new Set<string>();
const imagePreloadTasks = new Map<string, Promise<void>>();

function preloadImage(src: string) {
  if (!src || loadedImageUrls.has(src)) {
    return Promise.resolve();
  }

  const existingTask = imagePreloadTasks.get(src);
  if (existingTask) {
    return existingTask;
  }

  const task = new Promise<void>((resolve) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      loadedImageUrls.add(src);
      imagePreloadTasks.delete(src);
      resolve();
    };
    image.onerror = () => {
      imagePreloadTasks.delete(src);
      resolve();
    };
    image.src = src;
  });

  imagePreloadTasks.set(src, task);
  return task;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function toSlide(event: HomeNewsData["events"][number]): NewsSlide | null {
  const image = typeof event.image === "string" ? event.image.trim() : "";
  if (!event.url || !image) {
    return null;
  }

  return {
    title: event.title,
    subtitle:
      event.startAt && event.endAt
        ? `${formatDate(event.startAt)} - ${formatDate(event.endAt)}`
        : "Open the official event details.",
    image,
    href: event.url,
  };
}

function SpinnerOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/40 text-white/85 backdrop-blur-sm">
      <LoaderCircle className="h-7 w-7 animate-spin" />
      <div className="text-xs tracking-[0.2em] uppercase">{label}</div>
    </div>
  );
}

function NewsTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative cursor-pointer pb-2 text-sm transition-all duration-200 ${
        active
          ? "text-[#F4C06A] drop-shadow-[0_0_6px_rgba(244,192,106,0.35)]"
          : "text-white/65 hover:text-[#F4C06A]"
      }`}
    >
      {label}
      <span
        className={`absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-[#F4C06A] transition-all duration-300 ${
          active ? "w-7 opacity-100" : "w-0 opacity-0"
        }`}
      />
    </button>
  );
}

function NewsListItem({ article }: { article: Aion2BoardArticle }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(article.url)}
      className="group flex w-full cursor-pointer items-center gap-3 border-b border-white/10 py-1.5 text-left text-sm transition last:border-0 hover:brightness-110"
    >
      <span className="min-w-0 flex-1 truncate font-semibold text-white transition-colors duration-200 group-hover:text-[#F4C06A]">
        {article.title}
      </span>
      <span className="shrink-0 text-right text-xs whitespace-nowrap text-white/65">
        {article.date}
      </span>
    </button>
  );
}

export function HomeNewsCarousel() {
  const [state, setState] = useState<HomeNewsState>({
    loading: true,
    data: EMPTY_HOME_NEWS_DATA,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>("notice");
  const [imageLoading, setImageLoading] = useState(true);

  const slides = state.data.events
    .map(toSlide)
    .filter((slide): slide is NewsSlide => Boolean(slide));
  const activeSlide = slides[activeIndex] ?? null;
  const listItems = activeTab === "notice" ? state.data.notices : state.data.updates;
  const hasMultipleSlides = slides.length > 1;

  const loadHomeNews = async () => {
    setState((current) => ({
      ...current,
      loading: true,
    }));

    try {
      const data = await fetchHomeNewsData();
      setState({
        loading: false,
        data,
      });
      setActiveIndex(0);
    } catch (error) {
      console.error("fetch home news failed:", error);
      setState({
        loading: false,
        data: EMPTY_HOME_NEWS_DATA,
      });
    }
  };

  useEffect(() => {
    void loadHomeNews();
  }, []);

  useEffect(() => {
    if (!hasMultipleSlides) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4500);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasMultipleSlides, slides.length]);

  useEffect(() => {
    if (!slides.length) {
      setImageLoading(false);
      return;
    }

    slides.forEach((slide) => {
      void preloadImage(slide.image);
    });
  }, [slides]);

  useEffect(() => {
    if (!activeSlide?.image) {
      setImageLoading(false);
      return;
    }

    setImageLoading(!loadedImageUrls.has(activeSlide.image));
  }, [activeSlide?.href, activeSlide?.image]);

  const handleOpenSlide = () => {
    if (!activeSlide?.href) {
      return;
    }
    void openUrl(activeSlide.href);
  };

  const showPrev = () => {
    if (!hasMultipleSlides) {
      return;
    }
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    if (!hasMultipleSlides) {
      return;
    }
    setActiveIndex((current) => (current + 1) % slides.length);
  };

  return (
    <section className="overflow-hidden rounded-md border border-white/15 bg-black/45 shadow-2xl backdrop-blur-xl">
      <div className="relative h-[300px] overflow-hidden bg-black/20">
        {state.loading ? <SpinnerOverlay label="Loading" /> : null}

        {!state.loading && activeSlide ? (
          <button
            type="button"
            onClick={handleOpenSlide}
            className="absolute inset-0 cursor-pointer"
          >
            <img
              key={`${activeSlide.href}-${activeSlide.image}`}
              src={activeSlide.image}
              alt={activeSlide.title}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              onLoad={() => {
                loadedImageUrls.add(activeSlide.image);
                setImageLoading(false);
              }}
              onError={() => setImageLoading(false)}
            />

            {imageLoading ? <SpinnerOverlay label="Loading Image" /> : null}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-left">
              <div className="mt-1 text-base font-semibold text-white">{activeSlide.title}</div>
              <div className="mt-1 text-xs text-white/75">{activeSlide.subtitle}</div>
            </div>
          </button>
        ) : null}

        {!state.loading && !activeSlide ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-6 text-center text-sm text-white/70 backdrop-blur-sm">
            No official events are available right now.
          </div>
        ) : null}

        {activeSlide ? (
          <>
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={showPrev}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/85 backdrop-blur-md transition hover:bg-black/55"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={showNext}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/85 backdrop-blur-md transition hover:bg-black/55"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2">
              {slides.map((slide, index) => (
                <button
                  key={`${slide.href}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/45"
                  }`}
                  aria-label={slide.title}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-7">
            <NewsTabButton
              active={activeTab === "notice"}
              label="公告"
              onClick={() => setActiveTab("notice")}
            />
            <NewsTabButton
              active={activeTab === "update"}
              label="更新"
              onClick={() => setActiveTab("update")}
            />
          </div>

          <button
            type="button"
            onClick={() => void loadHomeNews()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-[#F4C06A]"
            aria-label="refresh news"
          >
            <RefreshCcw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {state.loading ? (
          <div className="flex items-center justify-center py-8 text-white/70">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : listItems.length > 0 ? (
          listItems
            .slice(0, 10)
            .map((article) => <NewsListItem key={article.id} article={article} />)
        ) : (
          <div className="py-6 text-center text-sm text-white/60">暂无内容</div>
        )}
      </div>
    </section>
  );
}
