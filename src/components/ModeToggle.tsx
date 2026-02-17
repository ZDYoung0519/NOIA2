"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    if (isAnimating) return;
    setIsAnimating(true);

    const currentTheme = theme === "system" ? systemTheme : theme;

    if (currentTheme === "light") {
      setTheme("dark");
    } else {
      setTheme("light");
    }

    // 动画结束后重置状态
    setTimeout(() => {
      setIsAnimating(false);
    }, 10);
  };

  // 在服务器端渲染时显示一个占位符，避免 hydration 不匹配
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle theme"
        className="relative overflow-hidden"
      >
        <div className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    );
  }

  // 获取当前显示的主题（处理 system 主题）
  const displayTheme = theme === "system" ? systemTheme : theme;

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={`
        relative
        overflow-hidden
        transition-all
        duration-300
        ease-in-out
        hover:scale-105
        active:scale-95
        ${isAnimating ? "scale-110 rotate-180" : ""}
      `}
    >
      {/* 背景动画层 */}
      <div
        className={`
        absolute inset-0 
        bg-gradient-to-br from-yellow-100 to-orange-100 
        dark:from-blue-900 dark:to-purple-900
        transition-opacity duration-300
        ${displayTheme === "dark" ? "opacity-100" : "opacity-0"}
      `}
      />

      {/* 图标容器 */}
      <div className="relative flex items-center justify-center">
        <Sun
          className={`
          h-[1.2rem] w-[1.2rem]
          transition-all duration-300 ease-in-out
          ${displayTheme === "light"
              ? "scale-100 rotate-0 text-orange-500"
              : "scale-0 -rotate-90"
            }
          ${isAnimating ? "animate-pulse" : ""}
        `}
        />

        <Moon
          className={`
          absolute h-[1.2rem] w-[1.2rem]
          transition-all duration-300 ease-in-out
          ${displayTheme === "dark"
              ? "scale-100 rotate-0 text-blue-300"
              : "scale-0 rotate-90"
            }
          ${isAnimating ? "animate-pulse" : ""}
        `}
        />
      </div>

      {/* 点击涟漪效果 */}
      <div
        className={`
        absolute inset-0 
        bg-white dark:bg-gray-800 
        opacity-0 
        transition-opacity duration-200
        ${isAnimating ? "opacity-20" : ""}
      `}
      />
    </Button>
  );
}
