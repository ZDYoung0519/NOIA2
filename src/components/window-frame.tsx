import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  History,
  Home,
  LineChart,
  MoreVertical,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { cn } from "@/lib/utils";
import { AuthModal } from "./auth-modal";

type WindowFrameProps = {
  titleBar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showSidebar?: boolean;
};

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "首页", path: "/", icon: Home },
  { label: "角色查询", path: "/character/search", icon: ShieldCheck },
  // { label: "角色评分排行", path: "/character/search", icon: ShieldCheck },
  // { label: "战斗历史", path: "/history-battle-query", icon: History },
  { label: "伤害排行", path: "/dps-view", icon: LineChart },
];

function SidebarNavItem({ path, label, icon: Icon }: NavItem) {
  return (
    <NavLink to={path}>
      {({ isActive }) => (
        <Button
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "h-11 w-full justify-start gap-3 rounded-xl px-3",
            isActive && "bg-primary/10 text-primary hover:bg-primary/15"
          )}
        >
          <span
            className={cn(
              "bg-background flex h-7 w-7 items-center justify-center rounded-lg border",
              isActive ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate">{label}</span>
        </Button>
      )}
    </NavLink>
  );
}

function WindowSidebar() {
  return (
    <aside className="bg-card/100 border-r px-4 py-4 backdrop-blur-sm">
      <div className="flex h-full w-40 flex-col gap-4">
        <div className="bg-card rounded-2xl border p-4">
          <div className="text-primary text-xs font-semibold tracking-[0.24em] uppercase">
            NOIA2
          </div>
          <div className="mt-1 text-lg font-semibold">Workspace</div>
          <div className="text-muted-foreground mt-1 text-sm">
            Control your tools from one place.
          </div>
        </div>

        <div className="space-y-2">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.path} {...item} />
          ))}
        </div>

        <div className="mt-auto space-y-2 border-t pt-4">
          <SidebarNavItem path="/settings-view" label="设置" icon={Settings} />
        </div>
      </div>
    </aside>
  );
}

export function WindowFrame({
  titleBar,
  children,
  className,
  contentClassName,
  showSidebar = false,
}: WindowFrameProps) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="tauri-ui-theme">
      <div className={cn("flex h-screen w-screen flex-col overflow-hidden", className)}>
        {titleBar}
        <main className="min-h-0 flex-1">
          <div className="flex h-full min-h-0">
            {showSidebar && <WindowSidebar />}

            <div
              className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", contentClassName)}
            >
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url("/images/aion2/background.png")`,
                  filter: "brightness(0.8) contrast(1.2)",
                }}
              />
              <div className="via-background/70 to-background/100 pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent" />
              <div className="from-background/50 to-background/50 pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent" />
              <div className="bg-background/65 pointer-events-none absolute inset-0" />

              <div className="relative z-10 flex h-full flex-col">
                <header className="bg-background/50 sticky top-0 z-50 grid shrink-0 items-center gap-4 px-5 backdrop-blur-sm xl:grid-cols-[1.15fr_0.72fr_0.55fr]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-8 w-8 rounded-full"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(1)}
                        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-8 w-8 rounded-full"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.location.reload()}
                        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-8 w-8 rounded-full"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="relative w-full max-w-[290px] pt-2 pb-2">
                      <Search className="text-muted-foreground absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2" />
                      <Input
                        placeholder={t("home.searchPlaceholder")}
                        className="border-border/50 placeholder:text-muted-foreground focus-visible:ring-ring h-10 rounded-2xl pl-11 text-sm shadow-none focus-visible:ring-1"
                      />
                    </div>
                  </div>

                  <div />

                  <div className="flex items-center justify-end gap-3">
                    <AuthModal />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full"
                    >
                      <Bell className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-auto">{children}</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
