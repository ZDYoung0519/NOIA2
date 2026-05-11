import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  House as Home,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings,
  Trophy as LineChart,
  UserSearch as ShieldCheck,
  type LucideIcon,
} from "lucide-react";

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
  showTopbar?: boolean;
};

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  activePaths?: string[];
};

const SIDEBAR_STORAGE_KEY = "noia-main-sidebar-expanded";

const NAV_ITEMS: NavItem[] = [
  { label: "首页", path: "/", icon: Home },
  { label: "角色查询", path: "/character/search", icon: ShieldCheck },
  { label: "伤害排行", path: "/dps-view", icon: LineChart },
];

function SidebarNavItem({ path, label, icon: Icon, expanded }: NavItem & { expanded: boolean }) {
  const location = useLocation();
  const activePaths =
    path === "/character/search" ? ["/character/search", "/character/view"] : [path];
  const isActive = activePaths.includes(location.pathname);

  return (
    <NavLink to={path} className="block" title={expanded ? undefined : label}>
      {() => (
        <Button
          variant="ghost"
          className={cn(
            "group relative h-10 w-full justify-start overflow-visible rounded-xl px-0 text-sm font-medium transition-[color,gap,padding] duration-200",
            expanded ? "gap-2.5 px-2" : "justify-center gap-0"
          )}
          aria-label={label}
        >
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="bg-accent absolute inset-0 z-0 rounded-xl"
              transition={{ type: "spring", stiffness: 460, damping: 38, mass: 0.7 }}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-active-line"
                className="bg-primary absolute top-1/2 -left-1.5 h-5 w-0.5 -translate-y-1/2 rounded-full"
                transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.55 }}
              />
            )}
            <Icon />
          </span>
          <span
            className={cn(
              "relative z-10 min-w-0 truncate text-left transition-[opacity,transform,width] duration-200",
              expanded ? "w-auto opacity-100" : "w-0 translate-x-1 opacity-0"
            )}
          >
            {label}
          </span>
        </Button>
      )}
    </NavLink>
  );
}

function WindowSidebar() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") {
      setExpanded(true);
    }
  }, []);

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "text-card-foreground shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        expanded ? "w-[212px]" : "w-16"
      )}
    >
      <div className="flex h-full flex-col px-3 pt-3 pb-3">
        <LayoutGroup id="main-sidebar-nav">
          <nav className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => (
              <SidebarNavItem key={item.path} {...item} expanded={expanded} />
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-1.5">
            <SidebarNavItem
              path="/settings-view"
              label="设置"
              icon={Settings}
              expanded={expanded}
            />
            <button
              type="button"
              className={cn(
                "group text-muted-foreground hover:text-foreground flex h-10 w-full items-center rounded-xl text-sm transition-colors",
                expanded ? "justify-start gap-2.5 px-2" : "justify-center gap-0"
              )}
              onClick={toggleExpanded}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              title={expanded ? undefined : "展开"}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors [&_svg]:size-4 [&_svg]:shrink-0">
                {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
              </span>
              <span
                className={cn(
                  "truncate transition-[opacity,transform,width] duration-200",
                  expanded ? "w-auto opacity-100" : "w-0 translate-x-1 opacity-0"
                )}
              >
                收起
              </span>
            </button>
          </div>
        </LayoutGroup>
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
  showTopbar = false,
}: WindowFrameProps) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "bg-background/85 text-card-foreground flex h-screen w-screen flex-col overflow-hidden",
        className
      )}
    >
      {titleBar}
      <main className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          {showSidebar && <WindowSidebar />}

          <section className="min-h-0 min-w-0 flex-1 p-0 pt-0">
            <div
              className={cn(
                "bg-card/45 relative h-full min-h-0 overflow-hidden rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.2)] ring-1 ring-black/5",
                contentClassName
              )}
            >
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
                style={{
                  backgroundImage: `url("/images/aion2/background.png")`,
                }}
              />
              <div className="via-background/35 to-background/45 pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent" />
              <div className="from-background/55 to-background/60 pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent" />
              <div className="bg-background/68 pointer-events-none absolute inset-0" />

              <div className="relative flex h-full flex-col">
                {showTopbar && (
                  <header className="bg-card/35 grid min-h-16 shrink-0 items-center gap-4 px-4 py-2 shadow-sm ring-1 ring-black/5 backdrop-blur-md xl:grid-cols-[1.15fr_0.72fr_0.55fr]">
                    <div className="flex items-center gap-3">
                      <div className="bg-card/70 flex items-center gap-1 rounded-xl p-1 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(-1)}
                          className="text-muted-foreground hover:bg-background/60 size-8 rounded-lg"
                        >
                          <ArrowLeft />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(1)}
                          className="text-muted-foreground hover:bg-background/60 size-8 rounded-lg"
                        >
                          <ArrowRight />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.location.reload()}
                          className="text-muted-foreground hover:bg-background/60 size-8 rounded-lg"
                        >
                          <RotateCcw />
                        </Button>
                      </div>

                      <div className="group relative w-full max-w-[360px]">
                        <Search className="text-muted-foreground group-focus-within:text-foreground pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 transition-colors" />
                        <Input
                          placeholder={t("home.searchPlaceholder")}
                          className="bg-card/72 focus-visible:ring-primary/25 h-10 rounded-xl border-transparent pr-4 pl-10 text-sm shadow-sm ring-1 ring-black/5 transition-[background-color,box-shadow] focus-visible:ring-1"
                        />
                      </div>
                    </div>

                    <div />

                    <div className="flex items-center justify-end gap-2">
                      <AuthModal />
                      <div className="bg-card/70 flex items-center gap-1 rounded-xl p-1 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-background/60 size-8 rounded-lg"
                        >
                          <Bell />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-background/60 size-8 rounded-lg"
                        >
                          <MoreVertical />
                        </Button>
                      </div>
                    </div>
                  </header>
                )}

                <div className="min-h-0 flex-1 overflow-hidden px-0 pb-0">
                  <div className="scrollbar-thumb-only h-full overflow-auto ring-black/5">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
