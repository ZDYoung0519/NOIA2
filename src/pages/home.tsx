import { BellRing, ChartNoAxesCombined, LayoutPanelLeft, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createWindow } from "@/lib/window";

const featureCards = [
  {
    title: "悬浮水表",
    description: "打开透明浮窗，在战斗中实时查看目标、玩家与技能明细。",
    icon: ChartNoAxesCombined,
  },
  {
    title: "主工作区",
    description: "在固定的左侧导航和标题栏中切换页面，不再每次重复挂载外壳。",
    icon: LayoutPanelLeft,
  },
  {
    title: "桌面提醒",
    description: "更新提示、设置入口与后续账号能力都会汇总在这里。",
    icon: BellRing,
  },
];

export default function HomePage() {
  const handleOpenDps = async () => {
    await createWindow("dps", {
      title: "DPS Meter",
      url: "/dps",
      width: 100,
      height: 400,
      resizable: true,
      maximizable: false,
      minimizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
    });
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="bg-primary/10 text-primary inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Home
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl tracking-tight">NOIA2 主控制台</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              这里是你的桌面工作区入口。左侧导航现在作为固定外壳存在，切换页面时只更新中间内容区域，交互会更稳定也更轻量。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="icon.png" className="h-16 w-16 rounded-2xl border p-2" alt="NOIA2" />
            <div className="text-muted-foreground text-sm">
              主窗口适合导航、设置、更新与未来角色系统，悬浮窗则继续专注在实时战斗体验。
            </div>
          </div>

          <Button onClick={() => void handleOpenDps()}>打开悬浮水表</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {featureCards.map(({ title, description, icon: Icon }) => (
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

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>当前结构</CardTitle>
            <CardDescription>主壳层会保留标题栏与左侧导航，内部页面独立渲染。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="bg-muted/50 rounded-xl border p-4 text-sm">
              Home、DPS 水表和角色评分现在共享同一套主窗口外壳。
            </div>
            <div className="bg-muted/50 rounded-xl border p-4 text-sm">
              Settings、About、DPS 浮窗和 Detail 仍保持原本的独立小窗逻辑。
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>下一步</CardTitle>
            <CardDescription>继续在这个主工作区里逐步填充你的桌面工具能力。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-muted/50 rounded-xl border p-4">补充账号和登录面板。</div>
            <div className="bg-muted/50 rounded-xl border p-4">扩展角色评分与构筑分析。</div>
            <div className="bg-muted/50 rounded-xl border p-4">继续打磨水表总览与历史回放入口。</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
