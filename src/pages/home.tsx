import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  Shield,
  Sword,
  ChevronRight,
  Github,
  Settings,
  Download,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";

// --- Types & Interfaces ---

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  color: string;
}

// --- Components ---

const GlitchText = ({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) => {
  return (
    <div className={`relative inline-block group ${className}`}>
      <span className="relative z-10">{text}</span>
      <span className="absolute top-0 left-0 -z-10 w-full h-full text-red-500 opacity-0 group-hover:opacity-70 animate-pulse translate-x-[2px]">
        {text}
      </span>
      <span className="absolute top-0 left-0 -z-10 w-full h-full text-cyan-400 opacity-0 group-hover:opacity-70 animate-pulse -translate-x-[2px]">
        {text}
      </span>
    </div>
  );
};

const FeatureCard = ({
  icon: Icon,
  title,
  desc,
  color,
}: {
  icon: any;
  title: string;
  desc: string;
  color: string;
}) => (
  <div className="group relative p-6 bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden transition-all duration-500 hover:bg-slate-800/60 hover:border-white/20 hover:-translate-y-1">
    <div
      className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${color} opacity-20 blur-2xl rounded-full group-hover:opacity-40 transition-opacity duration-500`}
    />
    <div className="relative z-10">
      <div
        className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2 font-sans tracking-wide">
        {title}
      </h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

// --- Main Application ---

export default function Home() {
  const [isFlipped, setIsFlipped] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Particles
  useEffect(() => {
    const initialParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.2,
      speedY: (Math.random() - 0.5) * 0.2,
      opacity: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.5 ? "#a855f7" : "#3b82f6", // Purple or Blue
    }));
    setParticles(initialParticles);
  }, []);

  // Animation Loop for Particles
  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: (p.x + p.speedX + 100) % 100,
          y: (p.y + p.speedY + 100) % 100,
        })),
      );
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Mouse Parallax Effect
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    setMousePosition({
      x: (clientX - innerWidth / 2) / 50,
      y: (clientY - innerHeight / 2) / 50,
    });
  };

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="">
      {/* Dynamic Background */}
      <div className="">
        {/* Animated Particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full blur-[1px] transition-transform duration-1000 ease-linear"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: `translate(${mousePosition.x * (p.id % 5)}px, ${mousePosition.y * (p.id % 5)}px)`,
            }}
          />
        ))}

        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "50px 50px",
            transform: `perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px) scale(2)`,
          }}
        />
      </div>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-24 flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-8 animate-fade-in-up">
          <Sparkles className="w-3 h-3" />
          <span>为 AION2 打造的次世代辅助工具</span>
        </div>

        {/* Main Title with Flip Interaction */}
        <div
          className="relative mb-6 perspective-1000 group cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div
            className={`relative transition-transform duration-700 transform-style-3d ${isFlipped ? "rotate-y-180" : ""}`}
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Front: NOIA2 */}
            <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-500 drop-shadow-2xl backface-hidden">
              NOIA<span className="text-purple-500">2</span>
            </h1>

            {/* Back: AION2 (Hidden by default) */}
            <h1
              className="absolute inset-0 text-7xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 drop-shadow-2xl backface-hidden rotate-y-180"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              AION<span className="text-white">2</span>
            </h1>
          </div>

          {/* Reflection/Glow */}
          <div className="absolute -inset-10 bg-purple-600/20 blur-3xl rounded-full -z-10 opacity-50 group-hover:opacity-75 transition-opacity" />
        </div>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
          永恒之塔的世界正在重构。 永恒诺亚（NOIA）是连接{" "}
          <span className="text-white font-semibold">天界</span>、
          <span className="text-purple-400 font-semibold">魔界</span> 与{" "}
          <span className="text-red-400 font-semibold">龙界</span> 的数据枢纽。
          <br />
          <span className="text-xs text-slate-500 mt-2 block">
            (点击上方 Logo 翻转，见证逆序之美)
          </span>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <button className="px-8 py-4 bg-white text-slate-950 rounded-xl font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2">
            <Download className="w-5 h-5" />
            立即下载
          </button>
          <Link
            to={"/changelog"}
            className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
          >
            <Terminal className="w-5 h-5 group-hover:text-purple-400 transition-colors" />
            查看文档
          </Link>
        </div>

        {/* Stats / Info Bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16 border-t border-white/10 pt-8 w-full max-w-4xl">
          {[
            { label: "支持版本", value: "AION 2.0+" },
            { label: "核心架构", value: "React + Rust" },
            { label: "实时同步", value: "< 10ms" },
            { label: "开源协议", value: "GPL v3" },
          ].map((stat, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <span className="text-slate-500 text-xs uppercase tracking-widest mb-1">
                {stat.label}
              </span>
              <span className="text-white font-mono font-bold text-lg">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* Features Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-400 fill-yellow-400" />
            <GlitchText text="核心模块" />
          </h2>
          <a
            href="#"
            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
          >
            探索全部功能 <ChevronRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Sword}
            title="战斗分析 (DPS Meter)"
            desc="实时追踪团队成员的输出数据，深度解析技能循环与爆发时机。支持自定义战斗回放，并可导出 JSON/CSV 格式报表，助你精准优化团队配置。"
            color="from-red-500 to-orange-600"
          />
          <FeatureCard
            icon={Shield}
            title="角色评分"
            desc="一键查询角色攻击力、伤害增幅等核心属性，并提供基于当前装备与 Buff 的综合评分。附带属性阈值推荐与养成建议，帮你快速定位提升方向。"
            color="from-blue-500 to-cyan-600"
          />
          <FeatureCard
            icon={Settings}
            title="BD模拟器"
            desc="自由搭配装备、宠物盘与技能符文，实时预览属性变化。支持导入/导出模拟配置（开发中，即将支持配装对比与分享功能）。"
            color="from-purple-500 to-pink-600"
          />
        </div>
      </section>

      {/* Visual Demo / Interactive Section */}
      <section className="relative z-10 py-24 bg-slate-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
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
                "内置 AION 维基数据库，装备属性即点即查",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300">
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
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <div className="w-6 h-6 bg-white rounded flex items-center justify-center font-bold text-black text-xs">
              N
            </div>
            <span className="font-bold text-white">NOIA2 Project</span>
          </div>

          <div className="text-slate-600 text-sm">
            © 2026 NOIA2 Team. Not affiliated with NCSOFT. AION is a trademark
            of NCSOFT Corporation.
          </div>

          <div className="flex gap-4">
            <a
              href="#"
              className="text-slate-500 hover:text-white transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
