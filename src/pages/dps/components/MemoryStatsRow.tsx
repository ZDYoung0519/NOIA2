import React from "react";

// 定义 props 类型（复用你提供的接口）
export interface MemoryStats {
  cpu_percent: number; // CPU 使用率 (%)
  rss: number; // 物理内存使用量 (bytes)
  channel_size: number;
  cap_device: string; // 设备类型 (e.g., "cpu", "cuda")
  cap_port: string;
}

// 辅助函数：将字节转换为带单位的字符串 (KB/MB/GB)
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// 辅助函数：根据百分比返回合适的颜色
const getColorForPercentage = (percent: number): string => {
  if (percent >= 90) return "#ff4d4f"; // 红色（高负载）
  if (percent >= 70) return "#faad14"; // 橙色（中等负载）
  return "#52c41a"; // 绿色（低负载）
};

// 组件：单行显示 CPU、内存、GPU、显存占用
export const MemoryStatsRow: React.FC<MemoryStats> = ({
  cpu_percent,
  rss,
  channel_size,
  cap_device,
  cap_port,
}) => {
  return (
    <div>
      {/* 第一行：原有信息 */}
      <div
        className="items-center justify-center p-0 gap-5 select-none"
        style={{
          display: "flex",
          background: "transparent",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: "12px",
        }}
      >
        <span style={{ color: getColorForPercentage(cpu_percent) }}>
          CPU: {cpu_percent.toFixed(1)}%
        </span>
        <span>MEM: {formatBytes(rss * 1024 * 1024)}</span>
      </div>

      {/* 第二行：单独显示 Dev */}
      <div
        className="flex items-center justify-center p-0 select-none space-x-3"
        style={{
          background: "transparent",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: "12px",
          marginTop: "0px", // 可根据需要调整间距
        }}
      >
        <span className="">Dev: {cap_device.toString()}</span>
        <span className="">Port: {cap_port.toString()}</span>
        <span>Cha: {channel_size}</span>
      </div>
    </div>
  );
};
