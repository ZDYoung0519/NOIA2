import { invoke } from "@tauri-apps/api/core";

export default function DPSViewPage() {
  const handleOpenDPS = async () => {
    try {
      await invoke("show_window", { label: "dps" });
    } catch (err) {
      console.error("无法打开 DPS 窗口:", err);
    }
  };

  return (
    <>
      <section className="relative z-10 py-24 ">
        <div className="max-w-7xl mx-auto">
          <div className=" px-6 flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-6">
              <h2 className="text-4xl font-bold text-white leading-tight">
                数据可视化
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                  掌控战场每一秒
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                NOIA2 采用了全新的 WebGL
                渲染引擎，将复杂的战斗日志转化为直观的动态图表。
                不仅记录伤害，更分析你的每一次走位与技能释放时机。
              </p>
              <ul className="space-y-4">
                {[
                  "零延迟数据抓取技术",
                  "自适应 UI 缩放 (4K/带鱼屏完美支持)",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-slate-300"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mock UI Window */}
            <div className="flex-1 w-full max-w-lg">
              <div className="relative rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden group">
                {/* Window Header */}
                <div className="h-8 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  <div className="ml-auto text-xs text-slate-600 font-mono">
                    NOIA2 Client v0.9.1
                  </div>
                </div>

                {/* Window Content (Mock) */}
                <div className="p-6 font-mono text-xs space-y-4">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <div className="text-slate-500 mb-1">TARGET</div>
                      <div className="text-xl text-white font-bold">
                        Dragon Lord Beritra
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 mb-1">DPS RANK</div>
                      <div className="text-xl text-green-400 font-bold">#1</div>
                    </div>
                  </div>

                  {/* Fake Chart Bars */}
                  <div className="space-y-2">
                    {[85, 62, 45, 30, 12].map((h, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-slate-500 w-8">{i + 1}.</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full"
                            style={{ width: `${h}%`, opacity: 1 - i * 0.15 }}
                          />
                        </div>
                        <span className="text-slate-300 w-12 text-right">
                          {h}k
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800 flex gap-2">
                    <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Skill Chain: 98%
                    </span>
                    <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Crit Rate: 45%
                    </span>
                  </div>
                </div>

                {/* Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="px-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button
              className="px-8 py-4 bg-white text-slate-950 rounded-xl font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2"
              onClick={handleOpenDPS}
            >
              打开DPS统计
            </button>
            <button className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group">
              查看战斗历史
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
