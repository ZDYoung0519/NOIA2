import TrueFocus from "@/components/TrueFocus";
import "../App.css";
import ThemeProvider from "@/components/theme-provider";

export default function Splash() {
  return (
    <ThemeProvider>
      <div className="text-white bg-black w-screen h-screen flex items-center justify-center overflow-hidden space-x-10">
        <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-500 drop-shadow-2xl backface-hidden">
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
    </ThemeProvider>
  );
}
