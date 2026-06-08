import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Globe, HandHeart, Moon, RefreshCcw, Sun } from "lucide-react";
import { FaQq } from "react-icons/fa";
import { FaGithub } from "react-icons/fa6";
import { useTheme } from "@/components/theme-provider";

import { TitleBar } from "@/components/title-bar";
import { LanguageToggle } from "@/components/language-toggle";
import { useTranslation } from "react-i18next";
import { AuthModal } from "@/components/auth-modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ExternalAction = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  content?: React.ReactNode;
};

const EXTERNAL_ACTIONS: ExternalAction[] = [
  { label: "官网", href: "https://tw.ncsoft.com/aion2", icon: Globe },

  // {
  //   label: "Discord",
  //   href: "https://discord.com/",
  //   icon: FaDiscord,
  //   content: (
  //     <div className="flex w-[168px] flex-col items-center gap-2 text-center">
  //       <div className="text-xs font-medium text-white/80">Discord</div>
  //       <img
  //         src="/images/qr/discord.png"
  //         alt="Discord QR"
  //         className="h-[136px] w-[136px] rounded-xl border border-white/10 object-cover"
  //         draggable={false}
  //       />
  //     </div>
  //   ),
  // },
  {
    label: "Github",
    href: "https://github.com/ZDYoung0519/NOIA2",
    icon: FaGithub,
    content: (
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-xs font-medium">Github</div>
      </div>
    ),
  },
  {
    label: "QQ",
    href: "https://qm.qq.com/q/YikHNL9U6y",
    icon: FaQq,
    content: (
      <div className="flex w-[168px] flex-col items-center gap-2 text-center">
        <div className="text-xs font-medium">扫码加入QQ群</div>
        <img
          src="/images/qr/qq.jpg"
          alt="QQ QR"
          className="h-[136px] w-[136px] rounded-xl border border-white/10 object-cover"
          draggable={false}
        />
      </div>
    ),
  },
  {
    label: "赞助",
    href: "https://ifdian.net/a/zdyoung",
    icon: HandHeart,
    content: <SponsorTooltipContent />,
  },
];

const SPONSOR_QR_OPTIONS = [
  { label: "爱发电", image: "/images/qr/afd.jpg" },
  { label: "微信", image: "/images/qr/wxpay.jpg" },
] as const;

function TitleActionButton({
  label,
  onClick,
  children,
  content,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  content?: React.ReactNode;
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
      <TooltipContent
        side="bottom"
        align="center"
        className={content ? "rounded-2xl p-2" : "rounded-full px-3 py-1.5"}
      >
        {content ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

function SponsorTooltipContent() {
  return (
    <Tabs defaultValue={SPONSOR_QR_OPTIONS[0].label} className="w-[188px]">
      <TabsList className="w-full">
        {SPONSOR_QR_OPTIONS.map((option) => (
          <TabsTrigger key={option.label} value={option.label}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {SPONSOR_QR_OPTIONS.map((option) => (
        <TabsContent key={option.label} value={option.label} className="mt-0">
          <div className="flex flex-col items-center gap-2">
            <div className="border-border/60 bg-muted/20 rounded-xl border p-2">
              <img
                src={option.image}
                alt={`${option.label} QR`}
                className="h-[136px] w-[136px] rounded-lg object-cover"
                draggable={false}
              />
            </div>
            <div className="text-muted-foreground text-xs">{option.label}，扫码支持我</div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
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
            {EXTERNAL_ACTIONS.map(({ label, href, icon: Icon, content }) => {
              return (
                <TitleActionButton
                  key={label}
                  label={label}
                  onClick={() => void openUrl(href)}
                  content={content}
                >
                  <Icon size={16} />
                </TitleActionButton>
              );
            })}
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
