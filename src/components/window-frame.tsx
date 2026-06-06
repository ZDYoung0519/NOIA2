import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import {
  BarChart3,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Trophy as LineChart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  activePaths?: string[];
};

const SIDEBAR_STORAGE_KEY = "noia-main-sidebar-expanded";

const NAV_ITEMS: NavItem[] = [
  { label: "首页", path: "/", icon: Home },
  { label: "角色查询", path: "/character/search", icon: ShieldCheck },
  { label: "伤害排行", path: "/dps-rank", icon: LineChart },
  { label: "职业统计", path: "/dps-class-stats", icon: BarChart3 },
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

function WindowSidebar({ isHomePage }: { isHomePage: boolean }) {
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
        "text-card-foreground relative z-10 shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        isHomePage ? "bg-transparent" : "bg-background/52",
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
}: WindowFrameProps) {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  return (
    <div
      className={cn(
        "text-card-foreground relative flex h-screen w-screen flex-col overflow-hidden",
        isHomePage ? "bg-transparent" : "bg-background/95",
        className
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

      {isHomePage ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/bg_01_main.mp4" type="video/mp4" />
        </video>
      ) : null}

      <div
        className={cn(
          "relative z-20",
          isHomePage ? "bg-transparent" : "bg-background/62"
        )}
      >
        {titleBar}
      </div>
      <main className="min-h-0 flex-1">
        <div className="relative flex h-full min-h-0">
          {showSidebar && <WindowSidebar isHomePage={isHomePage} />}

          <section className="relative z-10 min-h-0 min-w-0 flex-1 p-0 pt-0">
            <div
              className={cn(
                "relative h-full min-h-0 overflow-hidden",
                isHomePage
                  ? "bg-transparent shadow-none ring-0"
                  : "rounded-2xl bg-background/52 shadow-[0_20px_70px_rgba(0,0,0,0.2)]",
                contentClassName
              )}
            >
              <div className="relative flex h-full flex-col">
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
