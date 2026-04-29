// src/pages/UserPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, Gift, Loader2, LogOut, Save, XCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/supabase";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";
import { UserAvatar } from "@/components/user-avatar";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ActivateResult {
  type: "success" | "error";
  message: string;
}

function formatDate(value?: string | null) {
  if (!value) return "永久有效";

  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDaysLeft(premiumUntil?: string | null) {
  if (!premiumUntil) return null;

  const expireDate = new Date(premiumUntil);
  const now = new Date();
  const diffDays = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return Math.max(diffDays, 0);
}

export default function UserPage() {
  const {
    user,
    loading,
    signOut,
    refreshUser,
    membership,
    membershipLoading,
    refreshMembership,
    isPremium,
  } = useUser();

  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [keyCode, setKeyCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<ActivateResult | null>(null);

  const userEmail = user?.email ?? "";

  const userName = useMemo(() => {
    return (
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      userEmail?.split("@")[0] ??
      "用户"
    );
  }, [user?.user_metadata?.full_name, user?.user_metadata?.name, userEmail]);

  const daysLeft = getDaysLeft(membership?.premium_until);

  const membershipTimeText = isPremium
    ? membership?.premium_until
      ? `${daysLeft ?? 0} 天`
      : "永久"
    : "普通用户";

  useEffect(() => {
    setNickname(user?.user_metadata?.full_name ?? "");
    setAvatarUrl(user?.user_metadata?.avatar_url ?? "");
  }, [user?.user_metadata?.full_name, user?.user_metadata?.avatar_url]);

  const handleSelectAvatar = useCallback(async () => {
    if (!user) return;

    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
      });

      if (!selected) return;

      setIsUploading(true);

      const selectedPath = selected as string;
      const fileData = await readFile(selectedPath);
      const fileName = selectedPath.split(/[/\\]/).pop() ?? "avatar.png";
      const extension = fileName.split(".").pop()?.toLowerCase() || "png";

      const file = new File([fileData], fileName, {
        type: `image/${extension}`,
      });

      const filePath = `${user.id}/${Date.now()}_${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      toast.success("头像上传成功");
    } catch (error) {
      console.error("上传头像失败:", error);
      toast.error("头像上传失败");
    } finally {
      setIsUploading(false);
    }
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) return;

    setIsUpdating(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: nickname.trim() || userName,
          avatar_url: avatarUrl,
        },
      });

      if (error) throw error;

      await refreshUser();
      toast.success("资料已保存");
    } catch (error) {
      console.error("保存资料失败:", error);
      toast.error("保存失败");
    } finally {
      setIsUpdating(false);
    }
  }, [avatarUrl, nickname, refreshUser, user, userName]);

  const handleActivate = useCallback(async () => {
    const trimmedKey = keyCode.trim().toUpperCase();

    if (!trimmedKey) {
      toast.error("请输入激活码");
      return;
    }

    setActivating(true);
    setActivateResult(null);

    try {
      const { data, error } = await supabase.rpc("activate_membership", {
        p_key_code: trimmedKey,
      });

      if (error) {
        const message = error.message || "激活失败，请稍后重试";
        setActivateResult({ type: "error", message });
        toast.error(message);
        return;
      }

      if (data?.success) {
        const message = data.message || (isPremium ? "续期成功" : "激活成功");
        setActivateResult({ type: "success", message });
        toast.success(message);
        setKeyCode("");
        await refreshMembership();
        return;
      }

      const message = data?.error || "激活失败，请检查激活码";
      setActivateResult({ type: "error", message });
      toast.error(message);
    } catch (error) {
      console.error("激活会员失败:", error);
      const message = "网络错误，请检查网络连接后重试";
      setActivateResult({ type: "error", message });
      toast.error(message);
    } finally {
      setActivating(false);
    }
  }, [isPremium, keyCode, refreshMembership]);

  const handleActivateKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && keyCode.trim() && !activating) {
      handleActivate();
    }
  };

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-[50vh] items-center justify-center text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载用户信息中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-muted-foreground flex h-[50vh] items-center justify-center text-sm">
        请先登录
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={avatarUrl}
              userName={userName}
              isPremium={isPremium}
              size="lg"
              onSelect={handleSelectAvatar}
              isUploading={isUploading}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="truncate text-xl">{userName}</CardTitle>

                {isPremium && <Badge className="rounded-full">PRO</Badge>}

                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    isPremium ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {membershipTimeText}
                </span>
              </div>

              <CardDescription className="mt-1 truncate">{userEmail}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Separator />

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="设置你的昵称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" value={userEmail} disabled />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                {isPremium ? (
                  <Crown className="text-primary h-4 w-4" />
                ) : (
                  <Gift className="text-primary h-4 w-4" />
                )}
                订阅计划
              </div>

              <span className="text-muted-foreground text-xs">
                {membershipLoading
                  ? "状态加载中"
                  : isPremium
                    ? `有效期至 ${formatDate(membership?.premium_until)}`
                    : "普通用户"}
              </span>
            </div>

            <div className="flex gap-2">
              <Input
                value={keyCode}
                onChange={(event) => setKeyCode(event.target.value.toUpperCase())}
                onKeyDown={handleActivateKeyDown}
                placeholder={isPremium ? "输入激活码以续费" : "输入激活码"}
                disabled={activating}
                autoComplete="off"
                className="font-mono tracking-wide uppercase"
              />

              <Button onClick={handleActivate} disabled={!keyCode.trim() || activating}>
                {activating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPremium ? (
                  "续期"
                ) : (
                  "激活"
                )}
              </Button>
            </div>

            {activateResult && (
              <div
                className={cn(
                  "flex items-center gap-2 text-sm",
                  activateResult.type === "success" ? "text-emerald-600" : "text-destructive"
                )}
              >
                {activateResult.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {activateResult.message}
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </Button>

            <Button onClick={handleSave} disabled={isUpdating || isUploading}>
              {isUpdating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isUpdating ? "保存中" : "保存修改"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
