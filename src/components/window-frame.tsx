import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Home, LineChart, LogIn, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  icon: typeof Home;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "DPS 水表", path: "/dps-view", icon: LineChart },
  { label: "角色评分", path: "/character-score", icon: ShieldCheck },
];

export function navigateTo(path: string) {
  if (window.location.pathname === path) {
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function SidebarNavButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active?: boolean;
  label: string;
  icon: typeof Home;
  onClick: () => void | Promise<void>;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-11 w-full justify-start gap-3 rounded-xl px-3",
        active && "bg-primary/10 text-primary hover:bg-primary/15"
      )}
      onClick={() => void onClick()}
    >
      <span
        className={cn(
          "bg-background flex h-7 w-7 items-center justify-center rounded-lg border",
          active ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
    </Button>
  );
}

function WindowSidebar() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const navItems = useMemo(() => NAV_ITEMS, []);

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
          {navItems.map((item) => (
            <SidebarNavButton
              key={item.path}
              label={item.label}
              icon={item.icon}
              active={pathname === item.path}
              onClick={() => navigateTo(item.path)}
            />
          ))}
        </div>

        <div className="mt-auto space-y-2 border-t pt-4">
          <SidebarNavButton label="用户登录" icon={LogIn} onClick={() => {}} />
          <SidebarNavButton
            label="设置"
            icon={Settings}
            onClick={() => navigateTo("/settings-view")}
          />
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
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tauri-ui-theme">
      <div className={cn("flex h-screen w-screen flex-col overflow-hidden", className)}>
        {titleBar}
        <main className="min-h-0 flex-1">
          <div className="flex h-full min-h-0">
            {showSidebar && <WindowSidebar />}
            <div className={cn("min-h-0 min-w-0 flex-1", contentClassName)}>{children}</div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
