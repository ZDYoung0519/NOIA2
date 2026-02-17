import TopNavigation from "@/components/TopNavigation";
import { Outlet } from "react-router-dom";

export default function Aion2Layout() {
  return (
    <div className="h-[93vh] flex flex-col">
      {/* 背景图片（fixed 相对于视口，z-0 置于底层） */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat bg-fixed z-0"
        style={{
          backgroundImage: `url("/images/aion2_bg.jpg")`,
          filter: "brightness(0.8) contrast(1.2)",
        }}
      />

      {/* 可选：添加遮罩层（如果需要） */}
      <div className="fixed inset-0 z-10 bg-gradient-to-b from-transparent via-background/70 to-background/100 pointer-events-none" />
      <div className="fixed inset-0 z-10 bg-gradient-to-r from-background/50 via-transparent to-background/50 pointer-events-none" />
      <div className="fixed inset-0 z-10 bg-background/65  pointer-events-none" />

      <div className="sticky top-0 z-50 backdrop-blur-lg bg-background/0 text-white">
        <TopNavigation />
      </div>

      {/* 滚动内容区（flex-1 自动填充剩余高度） */}
      <div className="flex-1 md:pl-[100px] md:pr-[100px] overflow-y-auto overflow-x-hidden simple-scrollbar z-20">
        <div className="mb-10 mt-10 md:mx-auto lg:p-0 max-w-[2000px] relative">
          {/* <div className="backdrop-blur-md bg-white/5 rounded-2xl shadow-2xl border border-white/10"> */}
          <Outlet />
          {/* </div> */}
        </div>
      </div>
    </div>
  );
}
