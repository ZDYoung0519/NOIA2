import { useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TargetCarouselProps {
  targets: number[];
  nicknameMap: Record<number, string>;
  currentTarget: number | null;
  onChange: (target: number | null) => void;
}

export const TargetCarousel = ({
  targets,
  nicknameMap,
  currentTarget,
  onChange,
}: TargetCarouselProps) => {
  // 构建选项列表："所有目标" + 具体目标
  const options = [
    { value: null, label: "所有目标" },
    ...targets.map((target) => ({
      value: target,
      label: nicknameMap[target] || `未知(${target})`,
    })),
  ];

  const currentIndex = options.findIndex((opt) => opt.value === currentTarget);
  const displayIndex = currentIndex === -1 ? 0 : currentIndex;

  const handlePrev = () => {
    const newIndex = displayIndex > 0 ? displayIndex - 1 : options.length - 1;
    onChange(options[newIndex].value);
  };

  const handleNext = () => {
    const newIndex = displayIndex < options.length - 1 ? displayIndex + 1 : 0;
    onChange(options[newIndex].value);
  };

  // 鼠标滚轮支持
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    },
    [displayIndex, options.length],
  );

  useEffect(() => {
    const element = document.getElementById("target-carousel");
    if (element) {
      element.addEventListener("wheel", handleWheel, { passive: false });
      return () => element.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  return (
    <div
      id="target-carousel"
      className="flex items-center gap-1 bg-white/5 rounded border border-white/10 px-1.5 py-0.5 select-none"
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 hover:bg-white/10 text-white/50 hover:text-white/80 p-0"
        onClick={handlePrev}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      <div className="flex-1 min-w-[80px] max-w-[100px] text-center">
        <span className="text-[11px] text-white/80 truncate block">
          {options[displayIndex].label}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 hover:bg-white/10 text-white/50 hover:text-white/80 p-0"
        onClick={handleNext}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
