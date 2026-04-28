import { useState, useMemo, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/custom-tooltip";
import { Card } from "@/components/ui/card";

interface DaevanionNode {
  boardId: number;
  nodeId: number;
  name: string;
  row: number;
  col: number;
  grade: "Common" | "Rare" | "Legend" | "Unique" | "initial" | "None";
  type: string;
  icon: string;
  effectList: { desc: string }[];
  open: number;
}

interface ActiveNode {
  boardId: number;
  nodeId: string | number;
}

const GradeIconMap: Record<string, { normal: string; active: string }> = {
  Common: {
    normal: "https://aion2planner.com/image/A.webp",
    active: "https://aion2planner.com/image/A_open.webp",
  },
  Rare: {
    normal: "https://aion2planner.com/image/B.webp",
    active: "https://aion2planner.com/image/B_open.webp",
  },
  Legend: {
    normal: "https://aion2planner.com/image/C.webp",
    active: "https://aion2planner.com/image/C_open.webp",
  },
  Unique: {
    normal: "https://aion2planner.com/image/D.webp",
    active: "https://aion2planner.com/image/D_open.webp",
  },
  initial: {
    normal: "https://aion2planner.com/image/A.webp",
    active: "https://aion2planner.com/image/A_open.webp",
  },
  None: {
    normal: "https://aion2planner.com/image/A.webp",
    active: "https://aion2planner.com/image/A_open.webp",
  },
};

const boardModules = import.meta.glob("/src/data/boardList/*.json", {
  eager: true,
}) as Record<string, { default: DaevanionNode[] }>;

function getBoardData(boardId: number) {
  let id = boardId;
  const lastDigit = boardId % 10;
  if (lastDigit >= 5 && lastDigit <= 8) {
    id = 40 + lastDigit;
  }
  return boardModules[`/src/data/boardList/${id}.json`]?.default ?? [];
}

function getNodeImage(node: DaevanionNode, activated: boolean) {
  if (node.type === "Start" && node.icon) return node.icon;

  return activated ? GradeIconMap[node.grade]?.active : GradeIconMap[node.grade]?.normal;
}

function NodeImage({ src, alt }: { src?: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {!loaded && (
        <div className="bg-muted/30 absolute inset-0 flex items-center justify-center rounded-md">
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        </div>
      )}

      {src ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain transition-opacity duration-200"
          style={{ opacity: loaded ? 1 : 0 }}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : null}
    </div>
  );
}

export function DaevanionGrid({
  boarderId,
  activeNodes,
  cellSize = 40,
}: {
  boarderId: number;
  activeNodes: ActiveNode[];
  cellSize?: number;
}) {
  const [gridLoading, setGridLoading] = useState(true);

  const boardData = useMemo(() => getBoardData(boarderId), [boarderId]);

  const visibleNodes = useMemo(() => {
    return boardData.filter((node) => node.type !== "None");
  }, [boardData]);

  const activeNodeSet = useMemo(() => {
    return new Set(activeNodes.map((node) => String(node.nodeId)));
  }, [activeNodes]);

  const { maxRow, maxCol } = useMemo(() => {
    return boardData.reduce(
      (acc, node) => ({
        maxRow: Math.max(acc.maxRow, node.row),
        maxCol: Math.max(acc.maxCol, node.col),
      }),
      { maxRow: 0, maxCol: 0 }
    );
  }, [boardData]);

  const width = maxCol * cellSize + cellSize;
  const height = maxRow * cellSize + cellSize;

  useEffect(() => {
    setGridLoading(true);

    const timer = window.setTimeout(() => {
      setGridLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [boarderId, activeNodes]);

  if (!boardData.length) {
    return (
      <Card className="bg-background/30 text-muted-foreground flex min-h-64 items-center justify-center rounded-2xl border p-4 text-sm backdrop-blur-sm">
        未找到 Board {boarderId} 数据
      </Card>
    );
  }

  return (
    <div>
      {gridLoading && (
        <div className="bg-background/60 absolute inset-0 z-20 flex items-center justify-center rounded-2xl backdrop-blur-sm">
          <div className="bg-background text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-2 text-sm shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <div
          className="relative transition-opacity duration-200"
          style={{
            width,
            height,
            opacity: gridLoading ? 0.45 : 1,
          }}
        >
          {visibleNodes.map((node) => {
            const activated = activeNodeSet.has(String(node.nodeId));
            const img = getNodeImage(node, activated);
            const hasEffect =
              node.effectList && node.effectList.some((e) => e.desc && e.desc.trim() !== "");

            const content = (
              <button
                key={node.nodeId}
                type="button"
                className="absolute flex items-center justify-center rounded-md transition hover:scale-110 hover:bg-white/10"
                style={{
                  width: cellSize,
                  height: cellSize,
                  top: `${(node.row - 1) * cellSize}px`,
                  left: `${(node.col - 1) * cellSize}px`,
                }}
              >
                <NodeImage src={img} alt={node.grade} />
              </button>
            );

            if (!hasEffect) return content;

            return (
              <Tooltip key={node.nodeId}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>

                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  <div className="space-y-1">
                    {node.effectList.map((e, i) => (e.desc ? <p key={i}>{e.desc}</p> : null))}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
