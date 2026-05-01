interface BaseRingCardProps {
  label: string;
  value?: string;
  subValue?: string;
  className?: string;
}

interface KdaRingCardProps extends Omit<BaseRingCardProps, "subValue"> {
  showHelp?: boolean;
}

const ringBaseClass = "relative flex h-[128px] w-[128px] items-center justify-center";

const diamondBaseClass = "absolute top-[6px] z-20 h-3.5 w-3.5 rotate-45";

function RingContent({
  label,
  value,
  subValue,
  valueClassName,
  compact = false,
}: BaseRingCardProps & {
  valueClassName?: string;
  compact?: boolean;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center leading-none">
      <span
        className={[
          "max-w-[82px] text-balance font-bold text-white drop-shadow",
          compact ? "text-[16px] leading-tight" : "text-[15px]",
        ].join(" ")}
      >
        {label}
      </span>

      {value ? (
        <span
          className={["mt-2 text-[26px] font-black tracking-tight", valueClassName].join(" ")}
        >
          {value}
        </span>
      ) : null}

      {subValue ? (
        <span className="mt-1 text-[12px] font-semibold text-[#b8c2c7]">{subValue}</span>
      ) : null}
    </div>
  );
}

export function KdaRingCard({ label, value, className }: KdaRingCardProps) {
  return (
    <div className={[ringBaseClass, className].join(" ")}>
      <div className={[diamondBaseClass, "bg-[#d9a73a]"].join(" ")} />

      <div className="relative flex h-[106px] w-[106px] items-center justify-center rounded-full border-2 border-[#d89b13] bg-[#101314] shadow-[0_0_18px_rgba(216,155,19,0.18)]">
        <RingContent label={label} value={value} valueClassName="text-[#d9a73a]" />
      </div>
    </div>
  );
}

export function WinRateRingCard({ label, value, subValue, className }: BaseRingCardProps) {
  return (
    <div className={[ringBaseClass, className].join(" ")}>
      <div className={[diamondBaseClass, "bg-[#37b6a9]"].join(" ")} />

      <div className="relative flex h-[106px] w-[106px] items-center justify-center overflow-hidden rounded-full border-2 border-[#24b8ad] bg-[#101314] shadow-[0_0_18px_rgba(36,184,173,0.18)]">
        <div className="absolute bottom-1 left-1/2 h-[42px] w-[90px] -translate-x-1/2 rounded-b-full bg-[radial-gradient(ellipse_at_center,rgba(22,145,162,0.65)_0%,rgba(15,99,117,0.45)_45%,rgba(8,21,27,0)_76%)]" />
        <div className="absolute bottom-[14px] h-[34px] w-[84px] rounded-[50%] border-t border-[#3fc8c0]/60 opacity-70" />
        <div className="absolute bottom-[9px] h-[28px] w-[78px] rounded-[50%] border-t border-[#3fc8c0]/35 opacity-70" />

        <RingContent
          label={label}
          value={value}
          subValue={subValue}
          valueClassName="text-white"
          compact={!value}
        />
      </div>
    </div>
  );
}
