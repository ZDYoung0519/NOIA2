"use client";
import { Link } from "react-router-dom";
import * as React from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { AuthDialog } from "./AuthDialog";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function TopNavigation() {
  const [user, setUser] = React.useState<User | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = React.useState(false);

  React.useEffect(() => {
    // 获取初始会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // 监听认证状态变化
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // 获取头像显示文字（邮箱首字母大写）
  const getAvatarFallback = () => {
    if (!user?.email) return "?";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <>
      <nav className="relative z-50 w-full px-6 py-6 flex items-center justify-between max-w-7xl mx-auto h-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
            N
          </div>
          <span className="font-bold text-xl tracking-tighter text-white">
            NOIA<span className="text-purple-400">2</span>
          </span>
        </div>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link className={navigationMenuTriggerStyle()} to="/">
                  首页
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link className={navigationMenuTriggerStyle()} to="/dps/view">
                  DPS 统计
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link className={navigationMenuTriggerStyle()} to="/character">
                  角色评分
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link className={navigationMenuTriggerStyle()} to="/ranks">
                  排行榜
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            {/* <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link
                  className={navigationMenuTriggerStyle()}
                  to="/ranks_scrapy"
                >
                  排行榜（爬虫）
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem> */}

            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className="bg-transparent cursor-pointer"
              >
                <Link className={navigationMenuTriggerStyle()} to="/changelog">
                  更新日志
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {user ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLogout} className="focus:outline-none">
                  <Avatar className="h-9 w-9 border-2 border-purple-500/30 hover:border-purple-500 transition-colors">
                    <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-600 text-white font-medium">
                      {getAvatarFallback()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-sm">
                  <p className="font-medium">{user.email}</p>
                  <p className="text-xs text-muted-foreground">点击退出登录</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <button
            className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95"
            onClick={() => setAuthDialogOpen(true)}
          >
            登录 / 注册
          </button>
        )}
      </nav>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
}
