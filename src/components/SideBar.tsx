"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Gamepad2,
  ChevronRight,
  ChevronDown,
  Settings,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "./LanguageSwitcher";

const Aion2Navigation = {
  name: "永恒之塔2",
  link: "/",
  icon: "/images/aion2/aion2.png",
  subLinks: [
    {
      name: "角色评分",
      link: "/character",
      icon: "/game_icons/aion2.png",
    },
    {
      name: "排行榜单",
      link: "/ranks",
      icon: "/game_icons/aion2.png",
    },
    { name: "DPS统计", link: "/aion2/dps/view", icon: "/game_icons/aion2.png" },
  ],
};

// const ZXSJ2Navigation = {
//   name: "诛仙世界",
//   link: "/dashboard",
//   icon: "/game_icons/zxsj.png",
//   subLinks: [
//     { name: "角色评分", link: "/dashboard", icon: "/game_icons/zxsj.png" },
//     { name: "BD模拟器", link: "/zxsj/builder", icon: "/game_icons/zxsj.png" },
//     { name: "互动地图", link: "/zxsj/map", icon: "/game_icons/zxsj.png" },
//   ],
// };

const navigationItems = [Aion2Navigation];

// ========== 子菜单动画 ==========
const SubMenu = ({
  children,
  isOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
}) => {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ overflow: "hidden" }}
          className="ml-8 mt-1 space-y-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ========== 工具函数 ==========
const getStoredCollapseState = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("sidebar-collapsed");
  return stored === "true";
};

const setStoredCollapseState = (collapsed: boolean) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }
};

// ========== 主组件 ==========
const SideNavigationBar = () => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

  // 初始化：从 localStorage 读取
  useEffect(() => {
    setIsCollapsed(getStoredCollapseState());
  }, []);

  // 同步状态到 localStorage
  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setStoredCollapseState(newCollapsed);
  };

  const toggleSubLinks = (name: string) => {
    setOpenStates((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  return (
    <motion.div
      className={`bg-background border-r flex flex-col py-4 z-50 hidden md:flex h-full items-center `}
      initial={false}
      animate={{ width: isCollapsed ? "3rem" : "10rem" }}
      transition={{ type: "spring", damping: 20, stiffness: 200 }}
    >
      {/* Logo */}
      <div className="px-3 pb-4 flex justify-center">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <Gamepad2 className="h-5 w-5" /> NOIA
          </Link>
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-10">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <div key={item.name}>
              {isCollapsed ? (
                // 折叠模式：只显示图标
                <Button variant="ghost" size="icon" asChild title={item.name}>
                  <Link to={item.link}>
                    <img src={item.icon} alt={item.name} className="w-5 h-5" />
                  </Link>
                </Button>
              ) : (
                // 展开模式：完整主项 + 子项
                <>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-3 py-2 text-base"
                    onClick={() => toggleSubLinks(item.name)}
                  >
                    <span className="flex items-center">
                      <img
                        src={item.icon}
                        alt={item.name}
                        className="w-5 h-5 mr-3"
                      />
                      {item.name}
                    </span>
                    {openStates[item.name] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>

                  <SubMenu isOpen={!!openStates[item.name]}>
                    {item.subLinks.map((sub) => (
                      <Button
                        key={sub.link}
                        variant="ghost"
                        className="w-full justify-start px-3 py-1.5 text-sm"
                        asChild
                      >
                        <Link to={sub.link}>{sub.name}</Link>
                      </Button>
                    ))}
                  </SubMenu>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="border-t pt-3 px-2 mt-auto space-y-2">
        {isCollapsed ? (
          <>
            <Button variant="ghost" size="icon" title="设置">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" title="语言">
              <Languages className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className="w-full justify-center px-3 py-2"
              onClick={() => console.log("Settings")}
            >
              <Settings className="mr-3 h-4 w-4" />
              整体设置
            </Button>
            {/* <Button
              variant="ghost"
              className="w-full justify-center px-3 py-2"
              onClick={() => console.log("Language")}
            >
              <Languages className="mr-3 h-4 w-4" />
              语言选择
            </Button> */}
            <LanguageSwitcher></LanguageSwitcher>
          </>
        )}

        {/* 折叠/展开按钮 */}
        <Button
          variant="ghost"
          size={isCollapsed ? "icon" : "sm"}
          className={isCollapsed ? "mx-auto" : "w-full justify- px-3 py-2"}
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <>
              <PanelLeftClose className="mr-3 h-4 w-4" />
              隐藏边栏
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
};

export default SideNavigationBar;
