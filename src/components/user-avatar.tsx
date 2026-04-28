// src/components/UserAvatar.tsx
import { Camera, Check, Crown, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarUrl?: string | null;
  userName: string;
  isPremium: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  onSelect?: () => void;
  isUploading?: boolean;
  showGlow?: boolean;
}

const sizeMap = {
  xs: {
    avatar: "h-8 w-8 text-sm",
    badge: "h-3 min-w-3 px-1",
    icon: "h-2 w-2",
    actionIcon: "h-2 w-2",
  },
  sm: {
    avatar: "h-11 w-11 text-sm",
    badge: "h-5 min-w-5 px-1",
    icon: "h-3 w-3",
    actionIcon: "h-4 w-4",
  },
  md: {
    avatar: "h-16 w-16 text-lg",
    badge: "h-6 min-w-6 px-1.5",
    icon: "h-3.5 w-3.5",
    actionIcon: "h-5 w-5",
  },
  lg: {
    avatar: "h-20 w-20 text-xl",
    badge: "h-7 min-w-7 px-2",
    icon: "h-4 w-4",
    actionIcon: "h-5 w-5",
  },
  xl: {
    avatar: "h-24 w-24 text-2xl",
    badge: "h-8 min-w-8 px-2.5",
    icon: "h-4.5 w-4.5",
    actionIcon: "h-6 w-6",
  },
};

function getInitials(name: string) {
  const value = name.trim();
  if (!value) return "U";

  const first = value.charAt(0);
  return /[\u4e00-\u9fa5]/.test(first) ? first : first.toUpperCase();
}

export function UserAvatar({
  avatarUrl,
  userName,
  isPremium,
  size = "md",
  onSelect,
  isUploading = false,
  showGlow = true,
}: UserAvatarProps) {
  const styles = sizeMap[size];
  const canSelect = Boolean(onSelect) && !isUploading;

  return (
    <button
      type="button"
      disabled={!canSelect}
      onClick={canSelect ? onSelect : undefined}
      aria-label={onSelect ? "更换头像" : `${userName} 的头像`}
      className={cn(
        "group relative inline-flex shrink-0 rounded-[2rem] outline-none",
        "transition duration-300 ease-out",
        canSelect &&
          "focus-visible:ring-ring cursor-pointer hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2",
        !canSelect && "cursor-default"
      )}
    >
      <span
        className={cn(
          "absolute -inset-2 rounded-[2rem] opacity-0 blur-xl transition-opacity duration-300",
          "bg-primary/15",
          isPremium && showGlow && "opacity-100"
        )}
      />

      <span
        className={cn(
          "bg-card relative rounded-[2rem] border p-1 shadow-sm",
          "transition-all duration-300",
          canSelect && "group-hover:shadow-md",
          isPremium ? "border-primary/20" : "border-border"
        )}
      >
        <Avatar className={cn(styles.avatar, "rounded-[1.5rem]")}>
          <AvatarImage src={avatarUrl || undefined} alt={userName} />
          <AvatarFallback
            className={cn(
              "rounded-[1.5rem] font-semibold",
              "from-muted to-muted/60 text-foreground bg-gradient-to-br"
            )}
          >
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>

        {isPremium && (
          <span
            className={cn(
              styles.badge,
              "absolute -top-1.5 -right-1.5 inline-flex items-center justify-center gap-1 rounded-full",
              "border-background bg-primary text-primary-foreground border shadow-sm"
            )}
            aria-label="高级会员"
          >
            <Crown className={styles.icon} />
            {size !== "sm" && <span className="text-[10px] leading-none font-semibold">PRO</span>}
          </span>
        )}

        {!isPremium && (
          <span
            className={cn(
              "absolute -right-1 -bottom-1 inline-flex items-center justify-center rounded-full",
              "border-background h-5 w-5 border-2 bg-emerald-500 text-white shadow-sm"
            )}
            aria-label="普通用户"
          >
            <Check className="h-3 w-3" />
          </span>
        )}

        {onSelect && (
          <span
            className={cn(
              "absolute inset-1 flex items-center justify-center rounded-[1.5rem]",
              "bg-background/80 text-foreground opacity-0 backdrop-blur-md",
              "transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
            )}
          >
            {isUploading ? (
              <span className="flex flex-col items-center gap-1 text-xs font-medium">
                <Loader2 className={cn(styles.actionIcon, "animate-spin")} />
                上传中
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs font-medium">
                <Camera className={styles.actionIcon} />
                更换
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
