import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { cn } from "@/lib/utils";

interface TcpReassemblyFlowStatus {
  connection: string;
  source: string;
  destination: string;
  nextSequence: number | null;
  pendingSegments: number;
  heldBytes: number;
  retransmits: number;
  gapSkips: number;
  idleMs: number;
  isCombatFlow: boolean;
}

interface TcpReassemblyStatus {
  combatConnection: string | null;
  totalFlows: number;
  totalPendingSegments: number;
  totalHeldBytes: number;
  totalRetransmits: number;
  totalGapSkips: number;
  flows: TcpReassemblyFlowStatus[];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatIdleTime(milliseconds: number) {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
}

export function TcpReassemblySettings() {
  const { t } = useAppTranslation();
  const [status, setStatus] = useState<TcpReassemblyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (showProgress = false) => {
    if (showProgress) setRefreshing(true);
    try {
      const nextStatus = await invoke<TcpReassemblyStatus>("get_tcp_reassembly_status");
      setStatus(nextStatus);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      if (showProgress) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("settings.tcpReassembly.title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("settings.tcpReassembly.description")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh(true)}
          disabled={refreshing}
        >
          <RefreshCw data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          {t("settings.tcpReassembly.refresh")}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("settings.tcpReassembly.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.tcpReassembly.overview")}</CardTitle>
          <CardDescription>{t("settings.tcpReassembly.autoRefresh")}</CardDescription>
          <CardAction>
            <Badge variant="secondary">
              {t("settings.tcpReassembly.flowCount", { count: status?.totalFlows ?? 0 })}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric
              label={t("settings.tcpReassembly.pending")}
              value={status?.totalPendingSegments ?? 0}
            />
            <Metric
              label={t("settings.tcpReassembly.held")}
              value={formatBytes(status?.totalHeldBytes ?? 0)}
            />
            <Metric
              label={t("settings.tcpReassembly.retransmits")}
              value={status?.totalRetransmits ?? 0}
            />
            <Metric
              label={t("settings.tcpReassembly.gapSkips")}
              value={status?.totalGapSkips ?? 0}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.tcpReassembly.connections")}</CardTitle>
          <CardDescription className="font-mono text-xs">
            {status?.combatConnection ?? t("settings.tcpReassembly.notDetected")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("settings.tcpReassembly.flow")}</TableHead>
                <TableHead>{t("settings.tcpReassembly.nextSequence")}</TableHead>
                <TableHead className="text-right">{t("settings.tcpReassembly.pending")}</TableHead>
                <TableHead className="text-right">{t("settings.tcpReassembly.held")}</TableHead>
                <TableHead className="text-right">
                  {t("settings.tcpReassembly.retransmits")}
                </TableHead>
                <TableHead className="text-right">{t("settings.tcpReassembly.gapSkips")}</TableHead>
                <TableHead className="pr-6 text-right">
                  {t("settings.tcpReassembly.idle")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {status?.flows.map((flow) => (
                <TableRow
                  key={flow.connection}
                  className={cn(flow.isCombatFlow && "bg-primary/10 hover:bg-primary/15")}
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      {flow.isCombatFlow ? (
                        <Badge>{t("settings.tcpReassembly.combat")}</Badge>
                      ) : null}
                      <div className="flex min-w-0 flex-col font-mono text-xs">
                        <span className="truncate">{flow.source}</span>
                        <span className="text-muted-foreground truncate">→ {flow.destination}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {flow.nextSequence ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{flow.pendingSegments}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(flow.heldBytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{flow.retransmits}</TableCell>
                  <TableCell className="text-right tabular-nums">{flow.gapSkips}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">
                    {formatIdleTime(flow.idleMs)}
                  </TableCell>
                </TableRow>
              ))}
              {status && status.flows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    {t("settings.tcpReassembly.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
