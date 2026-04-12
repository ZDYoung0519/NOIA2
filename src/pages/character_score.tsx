import { BarChart3, Gem, ShieldCheck, Sparkles } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const scoreCards = [
  {
    title: "角色构筑",
    description: "职业路线、技能特化与装备搭配可以在这里汇总成更清晰的角色画像。",
    icon: Gem,
  },
  {
    title: "评分结构",
    description: "把输出、命中、生存与副本职责拆成多维评分，而不是只看总伤害。",
    icon: BarChart3,
  },
  {
    title: "展示层",
    description: "延续主窗口的卡片式布局，后续可以自然接入排行、趋势与建议。",
    icon: ShieldCheck,
  },
];

export default function CharacterScorePage() {
  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="bg-primary/10 text-primary inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Character Score
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl tracking-tight">角色评分工作区</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              这个页面先作为角色系统的预留入口，整体风格和 Home 保持一致，方便后续逐步接入评分模型与角色数据。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm leading-6">
          相比悬浮水表，这里更适合承载慢节奏的信息：职业构筑、评分维度、装备分析、技能特化与副本表现摘要。
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {scoreCards.map(({ title, description, icon: Icon }) => (
          <Card key={title}>
            <CardHeader>
              <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription className="leading-6">{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>计划中的评分维度</CardTitle>
            <CardDescription>先把结构摆好，后面填入真实模型时会更顺畅。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="bg-muted/50 rounded-xl border p-4">职业专精与特化槽位分析</div>
            <div className="bg-muted/50 rounded-xl border p-4">副本目标与实战环境评分</div>
            <div className="bg-muted/50 rounded-xl border p-4">技能使用效率与覆盖率</div>
            <div className="bg-muted/50 rounded-xl border p-4">团队职责与个人表现拆分</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
            <CardDescription>页面已经接入主导航，接下来只需要填充真实数据层。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-muted/50 rounded-xl border p-4">主窗口外壳已固定，切页成本更低。</div>
            <div className="bg-muted/50 rounded-xl border p-4">后续可以把角色评分作为新的功能主线逐步扩展。</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
