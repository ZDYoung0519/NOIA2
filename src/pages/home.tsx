import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Bell,
  MoreVertical,
  Search,
  Plus,
  ArrowUp,
  FileText,
  ChevronDown,
  Download,
} from "lucide-react";
// import BankCardCarousel from "@/components/bank-card-carousel";
import CharacterCardCarousel from "@/components/character-card-carousel";

const customers = [
  { name: "Albert Flores", id: "#54678", avatar: "AF", img: "https://i.pravatar.cc/100?img=21" },
  { name: "Jacob Jones", id: "#38594", avatar: "JJ", img: "https://i.pravatar.cc/100?img=22" },
  { name: "Devon Lane", id: "#86551", avatar: "DL", img: "https://i.pravatar.cc/100?img=23" },
  { name: "Kathryn Murphy", id: "#10998", avatar: "KM", img: "https://i.pravatar.cc/100?img=24" },
];

const transactions = [
  {
    title: "Abstergo Ltd. Invoice #32",
    time: "16.07.2022, 5:32 pm",
    amount: "+ $12,000",
    positive: true,
    icon: "down",
  },
  {
    title: "Regular payment",
    time: "15.07.2022, 4:17 pm",
    amount: "- $12,000",
    positive: false,
    icon: "up",
  },
  {
    title: "Intellij IDEA Subscription",
    time: "15.07.2022, 3:00 pm",
    amount: "- $4,500",
    positive: false,
    icon: "up",
  },
  {
    title: "75638 VG Invoice #17",
    time: "14.07.2022, 11:20 am",
    amount: "+ $2,550",
    positive: true,
    icon: "down",
  },
];

const quickActions = [
  { label: "Dps水表", icon: Plus },
  { label: "角色评分", icon: ArrowUp },
  { label: "", icon: ArrowUp },
  { label: "Report", icon: FileText },
];

const incomePoints = [
  [0, 110],
  [60, 240],
  [120, 90],
  [180, 170],
  [240, 130],
  [300, 55],
  [360, 200],
  [420, 70],
  [480, 120],
  [540, 150],
  [600, 60],
  [660, 260],
  [720, 140],
];

const expensePoints = [
  [0, 150],
  [60, 190],
  [120, 140],
  [180, 165],
  [240, 205],
  [300, 150],
  [360, 120],
  [420, 260],
  [480, 140],
  [540, 120],
  [600, 190],
  [660, 250],
  [720, 110],
];

function pointsToPath(points: number[][]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point[0]},${point[1]}`)
    .join(" ");
}

function ActionIcon({ type }: { type: "up" | "down" }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-muted text-muted-foreground">
      {type === "up" ? <ArrowUp className="h-4 w-4" /> : <Download className="h-4 w-4" />}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1500px] pl-5 pr-5">
      <div className="space-y-8">
        <header className="grid items-center gap-4 xl:grid-cols-[1.15fr_0.72fr_0.55fr]">
          <div className="relative w-full max-w-[290px]">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="h-12 rounded-2xl border-border/50 bg-muted/50 pl-11 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div />

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
            <Avatar className="h-11 w-11 ring-4 ring-background">
              <AvatarImage src="https://i.pravatar.cc/100?img=13" alt="User avatar" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-8 xl:grid-cols-[1.16fr_0.6fr_0.56fr]">
          <div className="min-w-0">
            <CharacterCardCarousel />
          </div>

          <div className="min-w-0 pt-1">
            <h3 className="mb-6 text-[18px] font-semibold text-foreground md:text-[20px]">
              Main customers
            </h3>

            <div className="space-y-5">
              {customers.map((customer) => (
                <div key={customer.id} className="flex items-center gap-4">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={customer.img} alt={customer.name} />
                    <AvatarFallback>{customer.avatar}</AvatarFallback>
                  </Avatar>

                  <div>
                    <div className="text-[15px] font-medium text-foreground">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">{customer.id}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <Card className="rounded-[26px] border border-border/50 bg-muted/40 shadow-none">
              <CardContent className="p-4">
                <h3 className=" text-[18px] font-semibold text-foreground md:text-[20px]">
                  Quick actions
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {quickActions.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.label}
                        className="flex flex-col items-center gap-3 rounded-[22px] border border-border/50 bg-card px-3 py-5 text-foreground transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-x-8 gap-y-8 xl:grid-cols-[1.02fr_1fr]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-[20px] font-semibold text-foreground md:text-[22px]">
                Transactions
              </h3>

              <Button className="h-11 rounded-2xl px-5 text-sm font-medium shadow-none">
                Ask a report
              </Button>
            </div>

            <div className="space-y-6">
              {transactions.map((item) => (
                <div
                  key={`${item.title}-${item.time}`}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <ActionIcon type={item.icon as "up" | "down"} />

                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-foreground md:text-[16px]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.time}</p>
                    </div>
                  </div>

                  <div
                    className={`shrink-0 text-[16px] font-semibold ${
                      item.positive ? "text-emerald-500 dark:text-emerald-400" : "text-rose-400 dark:text-rose-300"
                    }`}
                  >
                    {item.amount}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-[20px] font-semibold text-foreground md:text-[22px]">
                Incomes & Expenses
              </h3>

              <Button
                variant="ghost"
                className="h-10 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Last 6 months
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-[28px] border border-border/50 bg-card pt-4">
              <div className="relative h-[270px] w-full overflow-hidden">
                <svg viewBox="0 0 720 300" className="h-full w-full" fill="none">
                  <path
                    d={pointsToPath(incomePoints)}
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                  <path
                    d={pointsToPath(expensePoints)}
                    stroke="hsl(var(--chart-2, 340 70% 70%))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                </svg>
              </div>

              <div className="grid grid-cols-6 px-4 pb-3 text-center text-sm font-medium text-muted-foreground md:px-6">
                {["Jan", "Feb", "Mar", "Apr", "May", "June"].map((month) => (
                  <div key={month}>{month}</div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}