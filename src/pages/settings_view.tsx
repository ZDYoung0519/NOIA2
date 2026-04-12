import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsContent } from "@/components/settings-content";

export default function SettingsViewPage() {
  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-4xl tracking-tight">设置</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6">
            左侧导航中的设置会直接切到主窗口内容区；标题栏的设置按钮仍然保留独立弹窗入口。
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="min-h-0 flex-1 overflow-hidden p-0">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SettingsContent />
        </div>
      </Card>
    </div>
  );
}
