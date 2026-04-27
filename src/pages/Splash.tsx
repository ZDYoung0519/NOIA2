import TrueFocus from "@/components/TrueFocus";
// import "../index.css";

export default function Splash() {
  return (
    <div className="flex h-full w-full items-center justify-center space-x-10 overflow-hidden">
      <h1 className="bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-5xl font-black tracking-tighter text-transparent drop-shadow-2xl backface-hidden">
        NOIA<span className="text-purple-500">2</span>
      </h1>
      <TrueFocus
        sentence="永恒 诺亚"
        manualMode={false}
        blurAmount={5}
        borderColor="#5227FF"
        animationDuration={0.5}
        pauseBetweenAnimations={1}
      />
    </div>
  );
}
