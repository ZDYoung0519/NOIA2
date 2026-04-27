import { useState, useCallback } from "react";
import { Camera, Loader2, LogOut, Save } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export function UserPage() {
  const { user, signOut, refreshUser } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [nickname, setNickname] = useState(user?.user_metadata?.full_name ?? "");

  // 头像 URL（本地 blob 或远程 URL）
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url ?? "");

  const userEmail = user?.email ?? "";
  const userName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    userEmail?.split("@")[0] ??
    "用户";

  // ─── 使用 Tauri 文件对话框选择图片 ───
  const handleSelectAvatar = useCallback(async () => {
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

      if (!selected) return; // 用户取消

      setIsUploading(true);

      // 读取本地文件为 Uint8Array
      const fileData = await readFile(selected as string);

      // 转换为 File 对象（用于上传）
      const fileName = selected.split(/[/\\]/).pop() ?? "avatar.png";
      const file = new File([fileData], fileName, {
        type: `image/${fileName.split(".").pop()}`,
      });

      // 上传到 Supabase Storage
      //   const filePath = `avatars/${user?.id}/${Date.now()}_${fileName}`;
      const filePath = `${user?.id}/${Date.now()}_${fileName}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadError) throw uploadError;

      // 获取公开 URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // 更新本地预览
      setAvatarUrl(publicUrl);

      toast.success("头像上传成功");
    } catch (error) {
      console.error("上传头像失败:", error);
      toast.error("上传头像失败");
    } finally {
      setIsUploading(false);
    }
  }, [user?.id]);

  // ─── 保存用户信息 ───
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

      // 刷新用户状态
      await refreshUser();

      toast.success("资料已更新");
    } catch (error) {
      console.error("更新失败:", error);
      toast.error("更新失败");
    } finally {
      setIsUpdating(false);
    }
  }, [user, nickname, avatarUrl, userName, refreshUser]);

  if (!user) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">请先登录</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">个人资料</h1>
        <p className="text-muted-foreground text-sm">管理你的账户信息和头像</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          {/* 头像区域 - 可点击更换 */}
          <div className="group relative cursor-pointer" onClick={handleSelectAvatar}>
            <Avatar className="h-20 w-20 hover:brightness-110">
              <AvatarImage src={avatarUrl} alt={userName} />
              <AvatarFallback className="text-2xl">
                {userName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Hover 遮罩 */}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : (
                <Camera className="h-6 w-6 text-white" />
              )}
            </div>
          </div>

          <div className="space-y-1">
            <CardTitle>{userName}</CardTitle>
            <p className="text-muted-foreground text-sm">{userEmail}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 昵称 */}
          <div className="space-y-2">
            <Label htmlFor="nickname">昵称</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="设置你的昵称"
            />
          </div>

          {/* 邮箱（只读） */}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" value={userEmail} disabled />
            <p className="text-muted-foreground text-xs">邮箱地址不可修改</p>
          </div>

          {/* 用户 ID（只读） */}
          <div className="space-y-2">
            <Label htmlFor="userId">用户 ID</Label>
            <Input id="userId" value={user.id} disabled className="font-mono text-xs" />
          </div>

          <Separator />

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={isUpdating || isUploading} className="flex-1">
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存修改
                </>
              )}
            </Button>

            <Button variant="destructive" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 创建时间 */}
      <p className="text-muted-foreground text-center text-xs">
        账户创建于 {new Date(user.created_at).toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}
