import TopNavigation from "@/components/TopNavigation";
import { Outlet } from "react-router-dom"; // 添加Outlet

export default function Aion2Layout() {
  return (
    <div>
      {/* 简洁版背景 */}
      <div className="fixed inset-0 overflow-hidden">
        {/* 背景图片 */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed"
          style={{
            backgroundImage: `url("/images/aion2_bg.jpg")`,
            filter: "brightness(0.8) contrast(1.2)",
          }}
        />

        {/* 多层渐变遮罩 */}
        <div className="absolute inset-0 ">
          {/* 主要遮罩：顶部透明到底部深色 */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background/100" />

          {/* 侧边遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/50 via-transparent to-background/50" />
        </div>
        {/* 微弱的纹理 */}
        <div className="absolute inset-0 bg-[url('/images/noise.png')] opacity-[0.03] bg-repeat" />
      </div>

      {/* 轻微的全局模糊 */}
      <div className="fixed inset-0 -z-40 bg-background/10 backdrop-blur pointer-events-none" />

      {/* 主要布局不变 */}
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-background/0 text-white">
        <TopNavigation />
      </div>

      <div className="flex-1 md:pl-[120px] md:pr-[120px] overflow-y-auto overflow-x-hidden simple-scrollbar">
        <div className="mb-10 mt-10 md:mx-auto lg:p-0 max-w-[1500px] relative">
          <div className="backdrop-blur-md bg-white/5 rounded-2xl shadow-2xl border border-white/10">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
