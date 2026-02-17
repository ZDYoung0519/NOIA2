import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
  Circle,
  Trash2,
  Clock,
  MousePointer2,
  Keyboard,
  ArrowLeft,
  FileCode,
  Zap,
  GripVertical,
  Plus,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Edit3,
  X,
} from "lucide-react";

// ==================== 类型定义 ====================

type TriggerType = "once" | "hold" | "toggle";

interface MacroEvent {
  id: string;
  type: "keydown" | "keyup" | "mousedown" | "mouseup" | "delay";
  key?: string;
  button?: number;
  x?: number;
  y?: number;
  delay: number;
  timestamp: number;
}

interface MacroScript {
  id: string;
  name: string;
  triggerKey: string;
  triggerType: TriggerType;
  events: MacroEvent[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface RecordingState {
  isRecording: boolean;
  events: MacroEvent[];
  lastEventTime: number | null;
}

const TRIGGER_TYPES: { value: TriggerType; label: string; desc: string }[] = [
  { value: "once", label: "重复1次", desc: "按下触发键后执行一次" },
  { value: "hold", label: "按住时重复", desc: "按住触发键时持续循环执行" },
  { value: "toggle", label: "自动循环", desc: "按一次开始循环，再按一次停止" },
];

// ==================== 存储管理 ====================

const Storage = {
  KEY: "logitech_macros",

  getAll(): MacroScript[] {
    try {
      const data = localStorage.getItem(this.KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  save(macro: MacroScript) {
    const macros = this.getAll();
    const index = macros.findIndex((m) => m.id === macro.id);
    if (index >= 0) {
      macros[index] = { ...macro, updatedAt: Date.now() };
    } else {
      macros.push(macro);
    }
    localStorage.setItem(this.KEY, JSON.stringify(macros));
  },

  delete(id: string) {
    const macros = this.getAll().filter((m) => m.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(macros));
  },

  checkConflict(key: string, excludeId?: string): MacroScript | null {
    return (
      this.getAll().find(
        (m) => m.triggerKey === key && m.enabled && m.id !== excludeId,
      ) || null
    );
  },
};

// ==================== Lua生成器 ====================

const generateLua = (macro: MacroScript) => {
  let lua = `-- 罗技G系列鼠标宏\n`;
  lua += `-- 名称: ${macro.name}\n`;
  lua += `-- 触发键: ${macro.triggerKey}\n`;
  lua += `-- 触发类型: ${TRIGGER_TYPES.find((t) => t.value === macro.triggerType)?.label}\n`;
  lua += `-- 生成时间: ${new Date().toLocaleString()}\n\n`;

  lua += `local macroId = "${macro.id}"\n`;
  lua += `local isRunning = false\n`;
  lua += `local toggleState = false\n\n`;

  lua += `local function executeMacro()\n`;
  macro.events.forEach((evt) => {
    if (evt.type === "delay") {
      lua += `    Sleep(${evt.delay})\n`;
    } else if (evt.type === "keydown") {
      lua += `    PressKey("${evt.key}")\n`;
    } else if (evt.type === "keyup") {
      lua += `    ReleaseKey("${evt.key}")\n`;
    } else if (evt.type === "mousedown") {
      const btn = evt.button === 0 ? 1 : evt.button === 2 ? 3 : 2;
      lua += `    PressMouseButton(${btn})\n`;
    } else if (evt.type === "mouseup") {
      const btn = evt.button === 0 ? 1 : evt.button === 2 ? 3 : 2;
      lua += `    ReleaseMouseButton(${btn})\n`;
    }
  });
  lua += `end\n\n`;

  // 根据触发类型生成控制逻辑
  if (macro.triggerType === "once") {
    lua += `-- 重复1次模式\n`;
    lua += `function OnEvent(event, arg)\n`;
    lua += `    if event == "MOUSE_BUTTON_PRESSED" and arg == ${macro.triggerKey} then\n`;
    lua += `        executeMacro()\n`;
    lua += `    end\n`;
    lua += `end\n`;
  } else if (macro.triggerType === "hold") {
    lua += `-- 按住时重复模式\n`;
    lua += `function OnEvent(event, arg)\n`;
    lua += `    if event == "MOUSE_BUTTON_PRESSED" and arg == ${macro.triggerKey} then\n`;
    lua += `        isRunning = true\n`;
    lua += `        while isRunning do\n`;
    lua += `            executeMacro()\n`;
    lua += `            Sleep(10)\n`;
    lua += `        end\n`;
    lua += `    elseif event == "MOUSE_BUTTON_RELEASED" and arg == ${macro.triggerKey} then\n`;
    lua += `        isRunning = false\n`;
    lua += `    end\n`;
    lua += `end\n`;
  } else if (macro.triggerType === "toggle") {
    lua += `-- 自动循环模式\n`;
    lua += `function OnEvent(event, arg)\n`;
    lua += `    if event == "MOUSE_BUTTON_PRESSED" and arg == ${macro.triggerKey} then\n`;
    lua += `        toggleState = not toggleState\n`;
    lua += `        if toggleState then\n`;
    lua += `            isRunning = true\n`;
    lua += `            while isRunning and toggleState do\n`;
    lua += `                executeMacro()\n`;
    lua += `                Sleep(10)\n`;
    lua += `            end\n`;
    lua += `        else\n`;
    lua += `            isRunning = false\n`;
    lua += `        end\n`;
    lua += `    end\n`;
    lua += `end\n`;
  }

  return lua;
};

// ==================== 管理页面组件 ====================

function MacroManager({
  onCreate,
  onEdit,
}: {
  onCreate: () => void;
  onEdit: (macro: MacroScript) => void;
}) {
  const [macros, setMacros] = useState<MacroScript[]>([]);
  const [conflictAlert, setConflictAlert] = useState<{
    macro: MacroScript;
    conflict: MacroScript;
  } | null>(null);

  useEffect(() => {
    setMacros(Storage.getAll());
  }, []);

  const refresh = () => setMacros(Storage.getAll());

  const toggleEnable = (macro: MacroScript) => {
    if (!macro.enabled) {
      const conflict = Storage.checkConflict(macro.triggerKey, macro.id);
      if (conflict) {
        setConflictAlert({ macro, conflict });
        return;
      }
    }

    macro.enabled = !macro.enabled;
    Storage.save(macro);
    refresh();

    if (macro.enabled) {
      console.log("执行Lua脚本:", generateLua(macro));
    }
  };

  const deleteMacro = (id: string) => {
    if (confirm("确定要删除这个宏吗？")) {
      Storage.delete(id);
      refresh();
    }
  };

  const getTriggerTypeLabel = (type: TriggerType) => {
    return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <div className="h-full bg-[#0f0f10] text-white font-sans">
      <div className="h-14 bg-[#1a1a1b] border-b border-[#2a2a2b] flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[#00b8a9] to-[#008b7d] rounded-lg flex items-center justify-center shadow-lg shadow-[#00b8a9]/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            G HUB <span className="text-[#00b8a9]">Macro Manager</span>
          </h1>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#00b8a9] hover:bg-[#00d4c3] rounded-lg transition-all text-sm font-medium shadow-lg shadow-[#00b8a9]/20"
        >
          <Plus className="w-4 h-4" />
          新建宏
        </button>
      </div>

      {conflictAlert && (
        <div className="mx-6 mt-4 p-4 bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl flex items-center gap-3 animate-in slide-in-from-top">
          <AlertCircle className="w-5 h-5 text-[#ff4757]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[#ff4757]">触发键冲突</p>
            <p className="text-xs text-[#8b8b8b]">
              宏 "{conflictAlert.macro.name}" 的触发键与已启用的宏 "
              {conflictAlert.conflict.name}" 冲突
            </p>
          </div>
          <button
            onClick={() => setConflictAlert(null)}
            className="px-3 py-1.5 bg-[#ff4757]/20 hover:bg-[#ff4757]/30 text-[#ff4757] rounded-lg text-xs font-medium transition-colors"
          >
            知道了
          </button>
        </div>
      )}

      <div className="p-6">
        {macros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#5a5a5b]">
            <div className="w-24 h-24 rounded-full bg-[#1a1a1b] border-2 border-dashed border-[#2a2a2b] flex items-center justify-center mb-4">
              <FileCode className="w-10 h-10" />
            </div>
            <p className="text-lg font-medium mb-1">暂无宏脚本</p>
            <p className="text-sm">点击右上角"新建宏"开始创建</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {macros.map((macro) => (
              <div
                key={macro.id}
                className={`
                  group flex items-center gap-4 p-4 rounded-xl border transition-all
                  ${
                    macro.enabled
                      ? "bg-[#00b8a9]/5 border-[#00b8a9]/20"
                      : "bg-[#1a1a1b] border-[#2a2a2b] hover:border-[#3a3a3b]"
                  }
                `}
              >
                <button
                  onClick={() => toggleEnable(macro)}
                  className={`
                    p-2 rounded-lg transition-all
                    ${macro.enabled ? "text-[#00b8a9]" : "text-[#5a5a5b] hover:text-[#8b8b8b]"}
                  `}
                >
                  {macro.enabled ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium truncate">{macro.name}</h3>
                    {macro.enabled && (
                      <span className="px-2 py-0.5 bg-[#00b8a9]/20 text-[#00b8a9] text-[10px] rounded-full font-medium">
                        运行中
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#8b8b8b]">
                    <span className="flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5" />
                      触发键: {macro.triggerKey}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" />
                      {getTriggerTypeLabel(macro.triggerType)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {macro.events.length} 事件
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(macro)}
                    className="p-2 hover:bg-[#2a2a2b] rounded-lg transition-colors text-[#8b8b8b] hover:text-white"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMacro(macro.id)}
                    className="p-2 hover:bg-[#ff4757]/10 rounded-lg transition-colors text-[#8b8b8b] hover:text-[#ff4757]"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 编辑器组件 ====================

function MacroEditor({
  initialMacro,
  onBack,
}: {
  initialMacro?: MacroScript;
  onBack: () => void;
}) {
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    events: initialMacro?.events || [],
    lastEventTime: null,
  });

  const [macroName, setMacroName] = useState(initialMacro?.name || "新建宏");
  const [triggerKey, setTriggerKey] = useState(initialMacro?.triggerKey || "");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialMacro?.triggerType || "once",
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showLuaCode, setShowLuaCode] = useState(false);
  const [isListeningTrigger, setIsListeningTrigger] = useState(false);

  const lastEventTime = useRef<number | null>(null);

  // 监听触发键输入
  useEffect(() => {
    if (!isListeningTrigger) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setTriggerKey(`Key_${e.key}`);
      setIsListeningTrigger(false);
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setTriggerKey(`Mouse_${e.button}`);
      setIsListeningTrigger(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [isListeningTrigger]);

  // ==================== 录制逻辑 ====================

  const startRecording = useCallback(() => {
    setRecording({
      isRecording: true,
      events: [],
      lastEventTime: Date.now(),
    });
    lastEventTime.current = Date.now();
    setSelectedEventId(null);
  }, []);

  const stopRecording = useCallback(() => {
    setRecording((prev) => ({
      ...prev,
      isRecording: false,
      lastEventTime: null,
    }));
    lastEventTime.current = null;
  }, []);

  const addEvent = useCallback(
    (type: MacroEvent["type"], data: Partial<MacroEvent>) => {
      if (!recording.isRecording || !lastEventTime.current) return;

      const now = Date.now();
      const delay = now - lastEventTime.current;

      const newEvent: MacroEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        delay: Math.max(1, delay),
        timestamp: now,
        ...data,
      };

      setRecording((prev) => ({
        ...prev,
        events: [...prev.events, newEvent],
        lastEventTime: now,
      }));
      lastEventTime.current = now;
    },
    [recording.isRecording],
  );

  useEffect(() => {
    if (!recording.isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      addEvent("keydown", { key: e.key });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      addEvent("keyup", { key: e.key });
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      addEvent("mousedown", {
        button: e.button,
        x: e.clientX,
        y: e.clientY,
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      addEvent("mouseup", {
        button: e.button,
        x: e.clientX,
        y: e.clientY,
      });
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, [recording.isRecording, addEvent]);

  // ==================== 拖拽逻辑 ====================

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newEvents = [...recording.events];
    const [removed] = newEvents.splice(draggedIndex, 1);
    newEvents.splice(dropIndex, 0, removed);

    setRecording((prev) => ({ ...prev, events: newEvents }));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // ==================== 编辑功能 ====================

  const deleteEvent = (id: string) => {
    setRecording((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== id),
    }));
    if (selectedEventId === id) setSelectedEventId(null);
  };

  const updateEventDelay = (id: string, newDelay: number) => {
    setRecording((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === id ? { ...e, delay: Math.max(1, newDelay) } : e,
      ),
    }));
  };

  const saveMacro = () => {
    if (recording.events.length === 0) {
      alert("请先录制事件");
      return;
    }
    if (!macroName.trim()) {
      alert("请输入宏名称");
      return;
    }
    if (!triggerKey) {
      alert("请设置触发按键");
      return;
    }

    const macro: MacroScript = {
      id: initialMacro?.id || `macro_${Date.now()}`,
      name: macroName,
      triggerKey,
      triggerType,
      events: recording.events,
      enabled: false,
      createdAt: initialMacro?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    Storage.save(macro);
    onBack();
  };

  // ==================== 渲染辅助 ====================

  const getEventIcon = (type: string) => {
    switch (type) {
      case "keydown":
      case "keyup":
        return <Keyboard className="w-4 h-4" />;
      case "mousedown":
      case "mouseup":
        return <MousePointer2 className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "keydown":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "keyup":
        return "bg-blue-500/10 text-blue-300 border-blue-500/20";
      case "mousedown":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "mouseup":
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const currentMacro: MacroScript = {
    id: initialMacro?.id || `macro_${Date.now()}`,
    name: macroName,
    triggerKey,
    triggerType,
    events: recording.events,
    enabled: false,
    createdAt: initialMacro?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  return (
    <div className="h-full bg-[#0f0f10] text-white font-sans">
      <div className="h-14 bg-[#1a1a1b] border-b border-[#2a2a2b] flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-[#8b8b8b] hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-[#2a2a2b]" />
          <h1 className="text-lg font-semibold tracking-tight">
            {initialMacro ? "编辑宏" : "新建宏"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLuaCode(!showLuaCode)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${showLuaCode ? "bg-[#00b8a9]/20 text-[#00b8a9]" : "hover:bg-[#2a2a2b] text-[#8b8b8b]"}
            `}
          >
            <FileCode className="w-4 h-4" />
            {showLuaCode ? "隐藏Lua" : "查看Lua"}
          </button>
          <button
            onClick={saveMacro}
            disabled={recording.events.length === 0}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium
              ${
                recording.events.length === 0
                  ? "bg-[#2a2a2b] text-[#5a5a5b] cursor-not-allowed"
                  : "bg-[#00b8a9] hover:bg-[#00d4c3] text-white shadow-lg shadow-[#00b8a9]/20"
              }
            `}
          >
            <Check className="w-4 h-4" />
            完成
          </button>
        </div>
      </div>

      <div className="flex h-full">
        {/* 左侧配置面板 */}
        <div className="w-80 bg-[#151516] border-r border-[#2a2a2b] p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                宏名称
              </label>
              <input
                type="text"
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                className="w-full bg-[#0f0f10] border border-[#2a2a2b] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00b8a9] transition-all"
                placeholder="输入宏名称..."
              />
            </div>

            {/* 触发按键捕获 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                触发按键
              </label>
              <div
                onClick={() =>
                  !isListeningTrigger && setIsListeningTrigger(true)
                }
                className={`
                  relative w-full h-14 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all
                  ${
                    isListeningTrigger
                      ? "bg-[#00b8a9]/10 border-[#00b8a9] animate-pulse"
                      : triggerKey
                        ? "bg-[#0f0f10] border-[#2a2a2b] hover:border-[#3a3a3b]"
                        : "bg-[#0f0f10] border-dashed border-[#3a3a3b] hover:border-[#5a5a5b]"
                  }
                `}
              >
                {isListeningTrigger ? (
                  <span className="text-[#00b8a9] font-medium">
                    请按下按键...
                  </span>
                ) : triggerKey ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-bold">
                      {triggerKey}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTriggerKey("");
                      }}
                      className="p-1 hover:bg-[#2a2a2b] rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-[#5a5a5b]" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[#5a5a5b]">点击设置触发键</span>
                )}
              </div>
              <p className="text-xs text-[#5a5a5b]">
                点击上方区域，然后按下键盘或鼠标按键
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                触发类型
              </label>
              <div className="space-y-2">
                {TRIGGER_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${
                        triggerType === type.value
                          ? "bg-[#00b8a9]/10 border-[#00b8a9]/30"
                          : "bg-[#0f0f10] border-[#2a2a2b] hover:border-[#3a3a3b]"
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="triggerType"
                      value={type.value}
                      checked={triggerType === type.value}
                      onChange={(e) =>
                        setTriggerType(e.target.value as TriggerType)
                      }
                      className="mt-0.5 accent-[#00b8a9]"
                    />
                    <div>
                      <div className="text-sm font-medium">{type.label}</div>
                      <div className="text-xs text-[#8b8b8b]">{type.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#2a2a2b]">
            <label className="text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
              录制
            </label>
            {!recording.isRecording ? (
              <button
                onClick={startRecording}
                className="w-full flex items-center justify-center gap-2 bg-[#ff3838] hover:bg-[#ff5252] text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-red-500/20 active:scale-95"
              >
                <Circle className="w-5 h-5 fill-current" />
                开始录制
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full flex items-center justify-center gap-2 bg-[#2a2a2b] border-2 border-[#ff3838] text-white py-3 rounded-xl font-medium transition-all"
              >
                <Square className="w-5 h-5 fill-[#ff3838]" />
                停止录制 ({recording.events.length} 事件)
              </button>
            )}
          </div>

          <div className="mt-auto space-y-3">
            <div className="bg-[#0f0f10] rounded-lg p-4 border border-[#2a2a2b]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-[#8b8b8b]">事件总数</span>
                <span className="text-lg font-bold text-[#00b8a9]">
                  {recording.events.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#8b8b8b]">总时长</span>
                <span className="text-sm font-medium">
                  {recording.events.reduce((acc, e) => acc + e.delay, 0)}ms
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm("确定要清空所有事件吗？")) {
                  setRecording((prev) => ({ ...prev, events: [] }));
                  setSelectedEventId(null);
                }
              }}
              disabled={recording.events.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-[#ff4757] hover:bg-[#ff4757]/10 transition-all disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              清空所有事件
            </button>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col bg-[#0f0f10]">
          {showLuaCode ? (
            <div className="flex-1 p-6 overflow-auto">
              <div className="bg-[#1a1a1b] rounded-xl border border-[#2a2a2b] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-[#151516] border-b border-[#2a2a2b]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#27ca40]" />
                    </div>
                    <span className="ml-3 text-xs text-[#8b8b8b] font-mono">
                      {macroName}.lua
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(generateLua(currentMacro))
                    }
                    className="text-xs px-3 py-1.5 bg-[#2a2a2b] hover:bg-[#3a3a3b] rounded transition-colors"
                  >
                    复制代码
                  </button>
                </div>
                <pre className="p-4 text-sm font-mono text-[#d4d4d4] overflow-x-auto leading-relaxed">
                  <code>{generateLua(currentMacro)}</code>
                </pre>
              </div>
            </div>
          ) : (
            <>
              <div className="h-12 border-b border-[#2a2a2b] flex items-center px-6 bg-[#151516]">
                <div className="flex items-center gap-8 text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                  <span className="w-8"></span>
                  <span className="w-12">类型</span>
                  <span className="w-32">事件</span>
                  <span className="w-24">延迟</span>
                  <span className="w-24">坐标</span>
                  <span className="flex-1">时间戳</span>
                  <span className="w-10">操作</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {recording.events.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#5a5a5b]">
                    <div className="w-16 h-16 rounded-full bg-[#1a1a1b] flex items-center justify-center mb-4">
                      <Circle className="w-8 h-8 text-[#2a2a2b]" />
                    </div>
                    <p className="text-sm">暂无录制事件</p>
                    <p className="text-xs mt-1">
                      点击"开始录制"捕获键盘和鼠标操作
                    </p>
                  </div>
                ) : (
                  recording.events.map((event, index) => (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onClick={() => setSelectedEventId(event.id)}
                      className={`
                        group flex items-center gap-8 px-4 py-3 rounded-lg border transition-all cursor-move
                        ${
                          selectedEventId === event.id
                            ? "bg-[#00b8a9]/10 border-[#00b8a9]/30"
                            : "bg-[#1a1a1b] border-[#2a2a2b] hover:border-[#3a3a3b]"
                        }
                        ${draggedIndex === index ? "opacity-30" : ""}
                        ${dragOverIndex === index ? "border-t-2 border-t-[#00b8a9]" : ""}
                      `}
                    >
                      <div className="w-8 flex justify-center cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-[#5a5a5b]" />
                      </div>

                      <div className="w-12 flex items-center gap-2">
                        <span className="text-[10px] text-[#5a5a5b] font-mono w-5">
                          {index + 1}
                        </span>
                        <div
                          className={`p-1.5 rounded ${getEventColor(event.type)}`}
                        >
                          {getEventIcon(event.type)}
                        </div>
                      </div>

                      <div className="w-32">
                        <span className="text-sm font-medium text-white">
                          {event.key ||
                            (event.button !== undefined
                              ? `鼠标按钮 ${event.button}`
                              : "-")}
                        </span>
                        <span className="text-xs text-[#8b8b8b] block capitalize">
                          {event.type
                            .replace("mouse", "鼠标")
                            .replace("key", "键盘")}
                        </span>
                      </div>

                      <div className="w-24">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={event.delay}
                            onChange={(e) =>
                              updateEventDelay(
                                event.id,
                                parseInt(e.target.value) || 0,
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 bg-[#0f0f10] border border-[#2a2a2b] rounded px-2 py-1 text-xs focus:border-[#00b8a9] focus:outline-none text-right"
                          />
                          <span className="text-xs text-[#5a5a5b]">ms</span>
                        </div>
                        <div className="mt-1 h-1 bg-[#0f0f10] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00b8a9]/50 rounded-full"
                            style={{
                              width: `${Math.min(100, event.delay / 10)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="w-24 font-mono text-xs text-[#8b8b8b]">
                        {event.x !== undefined ? `${event.x}, ${event.y}` : "-"}
                      </div>

                      <div className="flex-1 font-mono text-xs text-[#5a5a5b]">
                        {new Date(event.timestamp).toLocaleTimeString("zh-CN", {
                          hour12: false,
                        })}
                        .
                        {String(
                          new Date(event.timestamp).getMilliseconds(),
                        ).padStart(3, "0")}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEvent(event.id);
                        }}
                        className="w-10 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4 text-[#5a5a5b] hover:text-[#ff4757] transition-colors" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {recording.isRecording && (
        <div className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 bg-[#ff3838] text-white rounded-full shadow-2xl animate-pulse z-50">
          <Circle className="w-4 h-4 fill-current" />
          <span className="text-sm font-medium">正在录制...</span>
          <span className="text-xs opacity-80">
            {recording.events.length} 事件
          </span>
        </div>
      )}
    </div>
  );
}

// ==================== 主应用组件 ====================

export default function MacroApp() {
  const [view, setView] = useState<"manager" | "editor">("manager");
  const [editingMacro, setEditingMacro] = useState<MacroScript | undefined>();

  const handleCreate = () => {
    setEditingMacro(undefined);
    setView("editor");
  };

  const handleEdit = (macro: MacroScript) => {
    setEditingMacro(macro);
    setView("editor");
  };

  const handleBack = () => {
    setView("manager");
    setEditingMacro(undefined);
  };

  return view === "manager" ? (
    <MacroManager onCreate={handleCreate} onEdit={handleEdit} />
  ) : (
    <MacroEditor initialMacro={editingMacro} onBack={handleBack} />
  );
}
