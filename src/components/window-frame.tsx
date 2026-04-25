import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Home, LineChart, LogIn, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

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
  { label: "Home", path: "/", icon: Home },
  { label: "DPS 水表", path: "/dps-view", icon: LineChart },
  { label: "角色评分", path: "/character/search", icon: ShieldCheck },
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
          <SidebarNavItem path="/login" label="用户登录" icon={LogIn} />
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
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tauri-ui-theme">
      <div className={cn("flex h-screen w-screen flex-col overflow-hidden", className)}>
        {titleBar}
        <main className="min-h-0 flex-1">
          <div className="flex h-full min-h-0">
            {showSidebar && <WindowSidebar />}

            {/* 内容区域：relative 作为背景的定位上下文 */}
            <div
              className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", contentClassName)}
            >
              {/* 背景图片层：absolute 相对于内容区域 */}
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url("/images/aion2/background.png")`,
                  filter: "brightness(0.8) contrast(1.2)",
                }}
              />

              {/* 遮罩层：同样 absolute */}
              <div className="via-background/70 to-background/100 pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent" />
              <div className="from-background/50 to-background/50 pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent" />
              <div className="bg-background/65 pointer-events-none absolute inset-0" />

              {/* 实际内容 */}
              <div className="relative z-10 h-full overflow-auto">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
