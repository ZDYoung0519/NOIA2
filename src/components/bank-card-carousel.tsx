import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";


const bankCards = [
  {
    id: 1,
    date: "13.09.2016",
    title: "Main company account",
    number: "**** **** **** 3456",
    exp: "10/24",
    cvv: "***",
    amount: "$12,345",
    colors:
      "bg-[radial-gradient(circle_at_18%_88%,rgba(255,135,121,0.95),transparent_34%),radial-gradient(circle_at_55%_72%,rgba(241,84,150,0.9),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(38,108,255,0.95),transparent_22%),linear-gradient(135deg,#081126_0%,#091739_45%,#12204b_72%,#1d2152_100%)]",
  },
  {
    id: 2,
    date: "21.10.2018",
    title: "Savings account",
    number: "**** **** **** 8421",
    exp: "06/27",
    cvv: "***",
    amount: "$8,920",
    colors:
      "bg-[radial-gradient(circle_at_20%_82%,rgba(105,227,196,0.75),transparent_34%),radial-gradient(circle_at_60%_26%,rgba(67,133,255,0.72),transparent_28%),radial-gradient(circle_at_78%_80%,rgba(130,97,255,0.8),transparent_24%),linear-gradient(135deg,#0a1721_0%,#102739_48%,#153b5d_76%,#23395f_100%)]",
  },
  {
    id: 3,
    date: "08.02.2020",
    title: "Business expenses",
    number: "**** **** **** 1298",
    exp: "03/28",
    cvv: "***",
    amount: "$4,275",
    colors:
      "bg-[radial-gradient(circle_at_24%_80%,rgba(255,174,82,0.86),transparent_32%),radial-gradient(circle_at_68%_28%,rgba(255,92,146,0.82),transparent_26%),radial-gradient(circle_at_84%_74%,rgba(96,128,255,0.8),transparent_22%),linear-gradient(135deg,#1a1327_0%,#29173b_48%,#312161_72%,#182c59_100%)]",
  },
];


export default function BankCardCarousel() {
  const [activeIndex, setActiveIndex] = React.useState(0);

  const prev = () => {
    setActiveIndex((prevIndex) =>
      prevIndex === 0 ? bankCards.length - 1 : prevIndex - 1,
    );
  };

  const next = () => {
    setActiveIndex((prevIndex) =>
      prevIndex === bankCards.length - 1 ? 0 : prevIndex + 1,
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative h-[220px] w-full">
        {bankCards.map((card, index) => {
          const offset = (index - activeIndex + bankCards.length) % bankCards.length;
          const isActive = index === activeIndex;
          const isSecond = offset === 1;
          const isThird = offset === 2;

          let className = "";

          if (isActive) {
            className = "z-30 translate-x-0 translate-y-0 scale-100 opacity-100";
          } else if (isSecond) {
            className = "z-20 translate-x-6 translate-y-0 scale-[0.97] opacity-100";
          } else if (isThird) {
            className = "z-10 translate-x-12 translate-y-0 scale-[0.94] opacity-100";
          } else {
            className = "z-0 translate-x-16 scale-[0.92] opacity-0";
          }

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`absolute left-0 top-0 h-[220px] w-[72%] min-w-[420px] overflow-hidden rounded-[28px] p-7 text-left text-white shadow-[0_18px_40px_rgba(30,49,120,0.28)] transition-all duration-300 ${card.colors} ${className}`}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/80">{card.date}</p>
                    <h2 className="mt-2 text-[18px] font-semibold tracking-tight md:text-[20px]">
                      {card.title}
                    </h2>
                  </div>
                  <div className="relative mt-1 flex h-10 w-16 items-center">
                    <span className="absolute right-6 h-8 w-8 rounded-full bg-white/35" />
                    <span className="absolute right-0 h-8 w-8 rounded-full bg-white/20 ring-1 ring-white/10" />
                  </div>
                </div>

                <div className="text-[24px] font-medium tracking-[0.14em] text-white/95 md:text-[28px]">
                  {card.number}
                </div>

                <div className="flex items-end justify-between gap-5">
                  <div className="flex gap-8 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Exp date</p>
                      <p className="mt-1 text-lg font-medium">{card.exp}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Cvv</p>
                      <p className="mt-1 text-lg font-medium">{card.cvv}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-white/65">Available amount</p>
                    <p className="mt-1 text-[30px] font-semibold leading-none md:text-[36px]">
                      {card.amount}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        <div className="absolute bottom-3 left-0 z-40 flex items-center gap-2">
          {bankCards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`transition-all ${
                index === activeIndex
                  ? "h-3 w-8 rounded-full bg-[#5b84ff]"
                  : "h-3 w-3 rounded-full bg-[#d6def8]"
              }`}
              aria-label={`Go to card ${index + 1}`}
            />
          ))}
        </div>

        <div className="absolute bottom-0 right-0 z-40 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={prev}
            className="h-9 w-9 rounded-full border border-border/50 bg-background/80 shadow-sm backdrop-blur hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={next}
            className="h-9 w-9 rounded-full border border-border/50 bg-background/80 shadow-sm backdrop-blur hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>


    </div>
  );
}


