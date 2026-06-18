import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ALL_GAMES } from "@/game-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";

export function GameSelector() {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPicker, setShowPicker] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const activeGame =
    ALL_GAMES.find((g) => location.pathname.startsWith(g.rootPath)) ?? ALL_GAMES[0];

  const handleEnter = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowPicker(true);
  };

  const handleLeave = () => {
    hideTimerRef.current = window.setTimeout(() => setShowPicker(false), 150);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <img
            src={`/images/${activeGame.id}/logo.png`}
            alt={activeGame.name}
            className="h-12 w-auto shrink-0 cursor-pointer object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            draggable={false}
          />
          {showPicker && (
            <div className="absolute top-full left-0 z-50 mt-2 min-w-[120px] rounded-xl border border-white/10 bg-background/90 p-1.5 shadow-lg backdrop-blur">
              {ALL_GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setShowPicker(false);
                    navigate(g.rootPath);
                    window.location.reload();
                  }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeGame.id === g.id
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{t("gameSelector.selectGame")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
