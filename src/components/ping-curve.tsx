import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export const description = "A bar chart";

const chartConfig = {
  ping: {
    label: "ping",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PingCurve({ pingHistory }: { pingHistory?: [number, number][] }) {
  const data =
    pingHistory && pingHistory.length > 0
      ? pingHistory.map(([ts, ping]) => ({
          time: new Date(ts).toLocaleTimeString(),
          ping: Number(ping ?? 0),
        }))
      : [];

  const maxTicks = 6;
  const interval = data.length > maxTicks ? Math.ceil(data.length / maxTicks) - 1 : 0;
  const avg = data.length > 0 ? data.reduce((sum, d) => sum + d.ping, 0) / data.length : 0;
  return (
    <ChartContainer config={chartConfig}>
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{
          left: 0,
          right: 0,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="time"
          tickLine={true}
          axisLine={false}
          tickMargin={8}
          interval={interval}
          tickFormatter={(value) => (typeof value === "string" ? value.slice(0, 5) : String(value))}
        />
        <YAxis
          width={30}
          tickLine={false}
          axisLine={false}
          tickMargin={0}
          domain={["dataMin - 10", "dataMax + 10"]}
        />
        <ReferenceLine
          y={avg}
          stroke="#a9afb4"
          strokeDasharray="3 3"
          label={{
            value: `平均 ${avg.toFixed(0)} ms`,
            position: "insideBottomRight",
          }}
        />
        <ChartTooltip cursor={true} content={<ChartTooltipContent hideLabel />} />
        <Area dataKey="ping" type="natural" fillOpacity={0.4} fill="#3106ca" />
      </AreaChart>
    </ChartContainer>
  );
}
