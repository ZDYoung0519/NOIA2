import { Card } from "@/components/ui/card";
import { SettingsContent } from "@/components/settings-content";

export default function SettingsViewPage() {
  return (
    <div className="flex min-h-full flex-col gap-6 p-6">


      <Card className="min-h-0 flex-1 overflow-hidden p-0">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SettingsContent />
        </div>
      </Card>
    </div>
  );
}
