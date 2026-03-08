import { useState, useEffect, useCallback } from "react";
import { Keyboard, ChevronDown } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AppSettings } from "../hooks/useSettings";

// 辅助函数：Hex 转 RGBA
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 辅助函数：RGBA 转 Hex
const rgbaToHex = (rgba: string): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
};

// 辅助函数：获取 Alpha 值
const getAlphaFromRgba = (rgba: string): number => {
  const match = rgba.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  return match ? parseFloat(match[1]) : 1;
};

interface ColorPickerButtonProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
}

const ColorPickerButton = ({
  color,
  onChange,
  label,
}: ColorPickerButtonProps) => {
  const [hex, setHex] = useState(rgbaToHex(color));
  const alpha = getAlphaFromRgba(color);

  // 当外部 color 变化时同步 hex
  useEffect(() => {
    setHex(rgbaToHex(color));
  }, [color]);

  const handleHexChange = (newHex: string) => {
    setHex(newHex);
    onChange(hexToRgba(newHex, alpha));
  };

  const handleAlphaChange = (newAlpha: number[]) => {
    onChange(hexToRgba(hex, newAlpha[0] / 100));
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-white/60">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full h-9 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 justify-between px-3"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded border border-white/20"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-white/70 font-mono">{color}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 bg-gray-900/95 border-white/10">
          <div className="space-y-3">
            <HexColorPicker
              color={hex}
              onChange={handleHexChange}
              style={{ width: "100%", height: "120px" }}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/50">透明度</span>
                <span className="text-[10px] text-white/70">
                  {Math.round(alpha * 100)}%
                </span>
              </div>
              <Slider
                value={[alpha * 100]}
                onValueChange={handleAlphaChange}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface ShortcutInputProps {
  value: string;
  onChange: (shortcut: string) => void;
  label: string;
}

const ShortcutInput = ({ value, onChange, label }: ShortcutInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const keys: string[] = [];
      if (e.ctrlKey || e.metaKey) keys.push("Ctrl");
      if (e.altKey) keys.push("Alt");
      if (e.shiftKey) keys.push("Shift");

      // 忽略单独的修饰键
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      }

      setTempKeys(keys);

      // 如果按下了非修饰键，完成录制
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        const shortcut = keys.join("+");
        onChange(shortcut);
        setIsRecording(false);
        setTempKeys([]);
      }
    },
    [isRecording, onChange],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      // 检查是否所有键都释放了
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        // 如果只有修饰键被按下又释放，取消录制
        if (
          tempKeys.length > 0 &&
          tempKeys.every((k) => ["Ctrl", "Alt", "Shift"].includes(k))
        ) {
          setIsRecording(false);
          setTempKeys([]);
        }
      }
    },
    [isRecording, tempKeys],
  );

  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("keyup", handleKeyUp, true);
      return () => {
        window.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("keyup", handleKeyUp, true);
      };
    }
  }, [isRecording, handleKeyDown, handleKeyUp]);

  const handleClick = () => {
    setIsRecording(!isRecording);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-white/60">{label}</label>
      <button
        onClick={handleClick}
        className={`w-full h-9 px-3 rounded border flex items-center justify-between transition-all ${
          isRecording
            ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200 animate-pulse"
            : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70"
        }`}
      >
        <div className="flex items-center gap-2">
          <Keyboard className="w-3.5 h-3.5 opacity-50" />
          <span className="text-xs font-mono">
            {isRecording
              ? tempKeys.length > 0
                ? tempKeys.join("+")
                : "按下快捷键..."
              : value}
          </span>
        </div>
        {isRecording && (
          <span className="text-[10px] text-indigo-300">按任意键确认</span>
        )}
      </button>
      <p className="text-[9px] text-white/30">
        点击按钮后按下键盘组合键设置快捷键
      </p>
    </div>
  );
};

interface SettingPanelProps {
  settings: AppSettings;
  saveSettings: (settings: AppSettings) => void;
}

export const SettingPanel = ({ settings, saveSettings }: SettingPanelProps) => {
  // 移除本地状态，直接使用 settings prop

  // 更新单个设置并立即保存
  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2 simple-scrollbar">
      {/* 显示怪物统计 */}
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">显示怪物统计</span>
        <Switch
          checked={settings.showMobStats}
          onCheckedChange={(checked) => updateSetting("showMobStats", checked)}
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">自动切换目标</span>
        <Switch
          checked={settings.autoTarget}
          onCheckedChange={(checked) => updateSetting("autoTarget", checked)}
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-white/60">显示内存和网络信息</span>
        <Switch
          checked={settings.showMemory}
          onCheckedChange={(checked) => updateSetting("showMemory", checked)}
          className="data-[state=checked]:bg-indigo-500"
        />
      </div>

      {/* 最大显示数量设置 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">最大显示数量</span>
        <span className="text-[10px] text-white/50">
          {settings.maxDisplayCount}
        </span>
      </div>
      <Slider
        value={[settings.maxDisplayCount]}
        onValueChange={(v) => updateSetting("maxDisplayCount", v[0])}
        min={1}
        max={50}
        step={1}
        className="w-full"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">背景透明度</span>
        <span className="text-[10px] text-white/50">{settings.bgOpacity}%</span>
      </div>
      <Slider
        value={[settings.bgOpacity]}
        onValueChange={(v) => updateSetting("bgOpacity", v[0])}
        min={10}
        max={100}
        step={1}
        className="w-full"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">页面缩放比例</span>
        <span className="text-[10px] text-white/50">
          {settings.scaleFactor}%
        </span>
      </div>
      <Slider
        value={[settings.scaleFactor]}
        onValueChange={(v) => updateSetting("scaleFactor", v[0])}
        min={0.8}
        max={1.4}
        step={0.1}
        className="w-full"
      />

      <ColorPickerButton
        label="主玩家颜色 (进度条)"
        color={settings.mainPlayerColor}
        onChange={(color) => updateSetting("mainPlayerColor", color)}
      />

      <ColorPickerButton
        label="其他玩家颜色 (进度条)"
        color={settings.otherPlayerColor}
        onChange={(color) => updateSetting("otherPlayerColor", color)}
      />

      <ShortcutInput
        label="重置快捷键"
        value={settings.resetShortcut}
        onChange={(shortcut) => updateSetting("resetShortcut", shortcut)}
      />
    </div>
  );
};
