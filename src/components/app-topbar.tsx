import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  BadgeHelp,
  Globe,
  HandHeart,
  MessageCircleMore,
  MessagesSquare,
  RefreshCcw,
  Shield,
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/custom-tooltip";
import { AuthModal } from "@/components/auth-modal";

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

function TopbarIconButton({
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/82 backdrop-blur-sm transition hover:bg-white/16 hover:text-white"
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

export function AppTopbar() {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between px-10">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-1 rounded-full p-1.5">
          <TopbarIconButton label="返回" onClick={() => window.history.back()}>
            <ArrowLeft size={16} />
          </TopbarIconButton>
          <TopbarIconButton label="刷新" onClick={() => window.location.reload()}>
            <RefreshCcw size={16} />
          </TopbarIconButton>
        </div>

        <div className="flex items-center gap-6">
          <img
            src="/images/aion2/aion2.png"
            alt="AION2"
            className="h-12 w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            draggable={false}
          />

          <nav className="flex items-center gap-3">
            {EXTERNAL_ACTIONS.map(({ label, href, icon: Icon }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void openUrl(href)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/84 backdrop-blur-sm transition hover:bg-white/16 hover:text-white"
                    aria-label={label}
                  >
                    <Icon size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="rounded-full px-3 py-1.5">
                  {label}
                </TooltipContent>
              </Tooltip>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex items-center">
        <AuthModal />
      </div>
    </header>
  );
}
