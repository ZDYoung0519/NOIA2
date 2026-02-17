// AppLayout.tsx
import TitleBar from "./components/TitleBar";
import SideNavigationBar from "./components/SideBar";
import { Outlet } from "react-router-dom"; // 添加Outlet
import ThemeProvider from "@/components/theme-provider";
import { isDesktop } from "./lib/platform";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <div className="flex h-screen overflow-hidden bg-background simple-scrollbar">
        <SideNavigationBar />
        <div className="flex flex-col flex-1">
          {isDesktop && <TitleBar />}
          <div className="flex-1 overflow-auto">
            <Outlet />
            <Toaster />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
