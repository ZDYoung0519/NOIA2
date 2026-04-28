import { Link } from "react-router-dom";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/custom-tooltip";
import { LogOut, User as UserIcon } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/lib/supabase/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
        </DialogHeader>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          providers={[]}
          localization={{
            variables: {
              sign_in: {
                email_label: "邮箱地址",
                password_label: "密码",
                button_label: "登录",
              },
              sign_up: {
                email_label: "邮箱地址",
                password_label: "密码",
                button_label: "注册",
              },
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AuthModal() {
  const { user, signOut, isPremium, membershipLoading, membership } = useUser();
  const [showAuthModal, setShowAuthModal] = useState(true);

  const userEmail = user?.email ?? "";
  const userName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    userEmail?.split("@")[0] ??
    "用户";
  const avatarUrl = user?.user_metadata?.avatar_url ?? "";

  // 未登录状态
  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setShowAuthModal(true)} className="gap-2">
          <UserIcon className="h-4 w-4" />
          登录
        </Button>
        <AuthDialog open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }
  const membershipText = membershipLoading
    ? "会员状态加载中"
    : isPremium
      ? membership?.premium_until
        ? `会员到期：${new Date(membership.premium_until).toLocaleDateString("zh-CN")}`
        : "会员到期：永久有效"
      : "未开通会员";

  // 已登录状态
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/user">
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9 hover:brightness-110">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback>{userName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </Button>
          </Link>
        </TooltipTrigger>

        <TooltipContent side="bottom" align="end" className="w-56 p-0">
          <div className="flex flex-col">
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{userName}</p>

                {isPremium && (
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                    PRO
                  </span>
                )}
              </div>

              <p className="text-muted-foreground mt-0.5 truncate text-xs">{userEmail}</p>

              <p className="text-muted-foreground mt-1 text-xs">{membershipText}</p>
            </div>

            <div className="bg-border h-px" />

            <button
              onClick={(e) => {
                e.preventDefault();
                signOut();
              }}
              className="flex cursor-pointer items-center px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
