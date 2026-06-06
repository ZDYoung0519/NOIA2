import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  BadgeHelp,
  Globe,
  HandHeart,
  MessageCircleMore,
  MessagesSquare,
  Moon,
  RefreshCcw,
  Shield,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

import { TitleBar } from "@/components/title-bar";
import { LanguageToggle } from "@/components/language-toggle";
import { useTranslation } from "react-i18next";
import { AuthModal } from "@/components/auth-modal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/custom-tooltip";

type ExternalAction = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const EXTERNAL_ACTIONS: ExternalAction[] = [
  { label: "官网", href: "https://tw.ncsoft.com/aion2", icon: Globe },
  { label: "QQ", href: "https://qm.qq.com/", icon: MessageCircleMore },
  { label: "微信", href: "https://weixin.qq.com/", icon: MessagesSquare },
  { label: "微博", href: "https://weibo.com/", icon: BadgeHelp },
  { label: "Discord", href: "https://discord.com/", icon: Shield },
  { label: "赞助", href: "https://afdian.com/", icon: HandHeart },
];

function TitleActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="no-drag-region bg-background/20 flex h-10 w-10 items-center justify-center rounded-full text-white/82 backdrop-blur-sm transition hover:bg-white/16 hover:text-white"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="rounded-full px-3 py-1.5">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function MainTitleBar() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const handleToggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <TitleBar
      title=""
      showAppIcon={false}
      className="h-[65px] px-0"
      leftActions={
        <div className="flex min-w-0 items-center gap-6">
          <img
            src="/images/aion2/aion2.png"
            alt="AION2"
            className="h-12 w-auto shrink-0 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            draggable={false}
          />

          <div className="flex items-center gap-1 rounded-full p-1">
            <TitleActionButton label="返回" onClick={() => window.history.back()}>
              <ArrowLeft size={16} />
            </TitleActionButton>
            <TitleActionButton label="刷新" onClick={() => window.location.reload()}>
              <RefreshCcw size={16} />
            </TitleActionButton>
          </div>

          <div className="flex items-center gap-3">
            {EXTERNAL_ACTIONS.map(({ label, href, icon: Icon }) => (
              <TitleActionButton key={label} label={label} onClick={() => void openUrl(href)}>
                <Icon size={16} />
              </TitleActionButton>
            ))}
          </div>
        </div>
      }
      rightActions={
        <div className="flex items-center gap-2 pr-1">
          <AuthModal />
          <LanguageToggle />
          <button
            onClick={handleToggleTheme}
            className="title-bar-btn"
            aria-label={t("theme.toggle")}
            tabIndex={-1}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
        </div>
      }
    />
  );
}
