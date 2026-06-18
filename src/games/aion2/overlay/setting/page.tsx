import { lazy, Suspense } from "react";
import { WindowFrame } from "@/components/window-frame";
import { TitleBar } from "@/components/title-bar";

const Aion2Settings = lazy(() =>
  import("@/components/aion2-settings").then((m) => ({ default: m.Aion2Settings }))
);

export default function DpsV2Page() {
  return (
    <WindowFrame
      titleBar={<TitleBar title="NoiA DPS" showMaximize={false} />}
      showSidebar={false}
      contentClassName="overflow-auto p-4"
    >
      <Suspense fallback={null}>
        <Aion2Settings />
      </Suspense>
    </WindowFrame>
  );
}
