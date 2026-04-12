import { Activity, History, MonitorSmartphone, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createWindow } from "@/lib/window";

const overviewCards = [
  {
    title: "悬浮浮窗",
    description: "主战斗视图保持透明背景和紧凑布局，适合在游戏过程中常驻显示。",
    icon: MonitorSmartphone,
  },
  {
    title: "实时诊断",
    description: "Ping、CPU、RAM、日志与抓包状态会持续在浮窗链路中更新。",
    icon: Activity,
  },
  {
    title: "历史记录",
    description: "重置前按目标保存历史快照，后续可以继续扩展过滤与回放能力。",
    icon: History,
  },
];

export default function DpsViewPage() {
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
            <Waves className="h-3.5 w-3.5" />
            Dps View
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl tracking-tight">DPS 水表工作区</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              从主窗口进入你的悬浮水表体系。这里更像控制面板，真正的实时战斗内容仍然在独立的透明浮窗中显示。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-6">
          <div className="text-muted-foreground max-w-2xl text-sm leading-6">
            你可以从这里快速打开悬浮水表，并在未来继续扩展更完整的实时状态概览、战斗历史入口和目标筛选能力。
          </div>
          <Button onClick={() => void handleOpenDps()}>启动 DPS 浮窗</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {overviewCards.map(({ title, description, icon: Icon }) => (
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
            <CardTitle>视图定位</CardTitle>
            <CardDescription>主工作区负责入口与总览，浮窗负责细节与实时数据。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-muted/50 rounded-xl border p-4">
              悬浮水表窗口仍然保持当前的自定义标题栏、日志按钮、历史视图和玩家详情联动。
            </div>
            <div className="bg-muted/50 rounded-xl border p-4">
              主窗口页更适合放置启动入口、总览指标和后续的副本/角色分析摘要。
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>已接通链路</CardTitle>
            <CardDescription>当前这部分适合作为水表功能的主控入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-muted/50 rounded-xl border p-4">抓包、分发、聚合和实时推送已可用。</div>
            <div className="bg-muted/50 rounded-xl border p-4">玩家详情和日志窗口支持跟随浮窗。</div>
            <div className="bg-muted/50 rounded-xl border p-4">历史记录已支持按目标保存和查看。</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
