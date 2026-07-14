import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ShortcutInput } from "@/components/shortcut-input";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useSettings } from "@/hooks/use-settings";
import { SettingsGroup, SettingsRow as BaseSettingsRow } from "@/components/settings-layout";
import skillsZhCN from "@/i18n/locales/aion2skills/zh-CN.json";

type RGBA = [number, number, number, number];
type Aion2Tab = "shortcuts" | "overlay" | "buff" | "backend";
type BuffSlotType = "selfBuff" | "bossDebuff" | "empty";
type ActorClass =
  | "GLADIATOR"
  | "TEMPLAR"
  | "ASSASSIN"
  | "RANGER"
  | "SORCERER"
  | "ELEMENTALIST"
  | "CLERIC"
  | "CHANTER"
  | "FIGHTER";

const ACTOR_CLASSES: ActorClass[] = [
  "GLADIATOR",
  "TEMPLAR",
  "ASSASSIN",
  "RANGER",
  "SORCERER",
  "ELEMENTALIST",
  "CLERIC",
  "CHANTER",
  "FIGHTER",
];

const ACTOR_CLASS_NAMES: Record<ActorClass, string> = {
  GLADIATOR: "剑星",
  TEMPLAR: "守护星",
  ASSASSIN: "杀星",
  RANGER: "弓星",
  SORCERER: "魔道星",
  ELEMENTALIST: "精灵星",
  CLERIC: "治愈星",
  CHANTER: "护法星",
  FIGHTER: "拳星",
};

const BUFF_LAYOUT_STORAGE_KEY = "aion2-buff-monitor-layout:v1";

interface BuffMonitorSlot {
  id: string;
  type: BuffSlotType;
  skillCode?: number;
}

interface BuffMonitorRow {
  id: string;
  slots: BuffMonitorSlot[];
}

interface BuffMonitorClassLayout {
  rows: BuffMonitorRow[];
}

interface BuffMonitorLayoutConfig {
  version: 1;
  classes: Partial<Record<ActorClass, BuffMonitorClassLayout>>;
}

function rgbToHex([r, g, b]: RGBA): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

function hexToRgba(hex: string): RGBA {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, 255];
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <BaseSettingsRow label={title} description={description} control={children} />;
}

function createEmptyClassLayout(actorClass: ActorClass): BuffMonitorClassLayout {
  return { rows: [{ id: `row_${actorClass}_default`, slots: [] }] };
}

function loadBuffLayoutConfig(): BuffMonitorLayoutConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(BUFF_LAYOUT_STORAGE_KEY) || "");
    if (parsed?.version === 1 && parsed.classes && typeof parsed.classes === "object") {
      return parsed;
    }
  } catch (_) {
    /* use defaults */
  }
  return { version: 1, classes: {} };
}

function nextBuffId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function skillShortcode(skillCode: number | string): number {
  return Number(String(skillCode).slice(0, 4));
}

function resolveSkillId(skillCode: number | string): string {
  const raw = String(skillCode);
  const candidates = [raw, raw.length === 4 ? raw.padEnd(8, "0") : raw.slice(0, 8)];
  if (raw.length > 8) candidates.push(raw.slice(0, 8).replace(/\d$/, "0"));
  if (raw.length > 6) candidates.push(raw.slice(0, 6).padEnd(8, "0"));
  return [...new Set(candidates)].find((id) => id in skillsZhCN) || raw.slice(0, 8);
}

function skillName(skillCode: number | string): string {
  const resolvedId = resolveSkillId(skillCode);
  return (skillsZhCN as Record<string, string>)[resolvedId] || `技能 ${skillCode}`;
}

function skillIconSrc(skillCode: number | string): string {
  const resolvedId = resolveSkillId(skillCode);
  return `/aion2/skill/${resolvedId.length === 6 ? resolvedId : resolvedId.slice(0, 4)}.png`;
}

export function Aion2Settings() {
  const { config, updateSettings } = useSettings();
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<Aion2Tab>("shortcuts");
  const [buffActorClass, setBuffActorClass] = useState<ActorClass>("GLADIATOR");
  const [buffCandidateClass, setBuffCandidateClass] = useState<ActorClass>("GLADIATOR");
  const [buffPickerType, setBuffPickerType] = useState<Exclude<BuffSlotType, "empty">>("selfBuff");
  const [buffLayoutConfig, setBuffLayoutConfig] =
    useState<BuffMonitorLayoutConfig>(loadBuffLayoutConfig);
  const [buffCandidatesByClass, setBuffCandidatesByClass] = useState<
    Partial<Record<ActorClass, number[]>>
  >({});
  const [editingBuffSlot, setEditingBuffSlot] = useState<{
    rowId: string;
    slotId?: string;
  } | null>(null);

  const tabs: { id: Aion2Tab; label: string }[] = [
    { id: "shortcuts", label: t("settings.aion2.shortcuts") },
    { id: "overlay", label: t("settings.aion2.overlay") },
    { id: "buff", label: t("settings.aion2.buffMonitor") },
    { id: "backend", label: t("settings.aion2.backend") },
  ];
  const activeBuffLayout =
    buffLayoutConfig.classes[buffActorClass] ?? createEmptyClassLayout(buffActorClass);
  const buffIconStyle = config.aion2.buffMonitor.iconStyle ?? "style1";

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BUFF_LAYOUT_STORAGE_KEY) {
        setBuffLayoutConfig(loadBuffLayoutConfig());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    invoke<{
      actorClass?: ActorClass;
      selfBuffCandidateSkillCodesByClass?: Partial<Record<ActorClass, number[]>>;
    }>("get_buff_overlay_context")
      .then((context) => {
        setBuffCandidatesByClass(context.selfBuffCandidateSkillCodesByClass ?? {});
        if (context.actorClass && ACTOR_CLASSES.includes(context.actorClass)) {
          setBuffActorClass(context.actorClass);
          setBuffCandidateClass(context.actorClass);
        }
      })
      .catch(() => {
        setBuffCandidatesByClass({});
      });
  }, []);

  const saveBuffLayoutConfig = (nextConfig: BuffMonitorLayoutConfig) => {
    localStorage.setItem(BUFF_LAYOUT_STORAGE_KEY, JSON.stringify(nextConfig));
    setBuffLayoutConfig(nextConfig);
    void emit("buff-monitor-layout-changed", nextConfig);
  };

  const updateBuffClassLayout = (nextLayout: BuffMonitorClassLayout) => {
    saveBuffLayoutConfig({
      version: 1,
      classes: {
        ...buffLayoutConfig.classes,
        [buffActorClass]: nextLayout,
      },
    });
  };

  const addBuffRow = () => {
    updateBuffClassLayout({
      rows: [...activeBuffLayout.rows, { id: nextBuffId("row"), slots: [] }],
    });
  };

  const removeBuffRow = (rowId: string) => {
    const rows = activeBuffLayout.rows.filter((row) => row.id !== rowId);
    updateBuffClassLayout(rows.length > 0 ? { rows } : createEmptyClassLayout(buffActorClass));
    if (editingBuffSlot?.rowId === rowId) setEditingBuffSlot(null);
  };

  const removeBuffSlot = (rowId: string, slotId: string) => {
    updateBuffClassLayout({
      rows: activeBuffLayout.rows.map((row) =>
        row.id === rowId ? { ...row, slots: row.slots.filter((slot) => slot.id !== slotId) } : row
      ),
    });
    if (editingBuffSlot?.slotId === slotId) setEditingBuffSlot(null);
  };

  const upsertBuffSlot = (type: BuffSlotType, value?: number) => {
    const skillCode = skillShortcode(value ?? "");
    if (type !== "empty" && !Number.isFinite(skillCode)) return;
    const firstRowId = activeBuffLayout.rows[0]?.id ?? nextBuffId("row");
    const targetRowId = editingBuffSlot?.rowId ?? firstRowId;
    const isReplacingSlot = Boolean(editingBuffSlot?.slotId);
    const nextSlot: BuffMonitorSlot =
      type === "empty"
        ? { id: editingBuffSlot?.slotId ?? nextBuffId("slot"), type }
        : { id: editingBuffSlot?.slotId ?? nextBuffId("slot"), type, skillCode };

    const rows =
      activeBuffLayout.rows.length > 0 ? activeBuffLayout.rows : [{ id: targetRowId, slots: [] }];

    updateBuffClassLayout({
      rows: rows.map((row) => {
        if (row.id !== targetRowId) return row;
        if (!isReplacingSlot) return { ...row, slots: [...row.slots, nextSlot] };
        return {
          ...row,
          slots: row.slots.map((slot) => (slot.id === editingBuffSlot?.slotId ? nextSlot : slot)),
        };
      }),
    });
    setEditingBuffSlot({ rowId: targetRowId });
  };

  const clearBuffLayout = () => {
    updateBuffClassLayout(createEmptyClassLayout(buffActorClass));
    setEditingBuffSlot(null);
  };

  const activePickerCandidates = buffCandidatesByClass[buffCandidateClass] ?? [];
  const selectedBuffSlotId = editingBuffSlot?.slotId;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b pb-0">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px rounded-t-md px-3 py-1.5 text-sm transition-colors",
              tab === item.id
                ? "border-b-background bg-background border font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Shortcuts tab */}
      {tab === "shortcuts" && (
        <SettingsGroup title={t("settings.aion2.shortcuts")}>
          <SettingRow
            title={t("settings.aion2.shortcutShowDpsOverlay")}
            description={t("settings.aion2.shortcutShowDpsOverlayDesc")}
          >
            <ShortcutInput
              value={config.aion2.shortcuts.showDpsOverlay}
              onChange={(v) => updateSettings("aion2.shortcuts.showDpsOverlay", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.shortcutResetDpsMeter")}
            description={t("settings.aion2.shortcutResetDpsMeterDesc")}
          >
            <ShortcutInput
              value={config.aion2.shortcuts.resetDpsMeter}
              onChange={(v) => updateSettings("aion2.shortcuts.resetDpsMeter", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.shortcutToggleLock")}
            description={t("settings.aion2.shortcutToggleLockDesc")}
          >
            <ShortcutInput
              value={config.aion2.shortcuts.toggleLock}
              onChange={(v) => updateSettings("aion2.shortcuts.toggleLock", v)}
            />
          </SettingRow>
        </SettingsGroup>
      )}

      {/* Overlay tab */}
      {tab === "overlay" && (
        <SettingsGroup title={t("settings.aion2.overlay")}>
          <SettingRow title={t("settings.aion2.overlayFontFamily")} description="">
            <select
              value={config.aion2.overlay.fontFamily}
              onChange={(e) => updateSettings("aion2.overlay.fontFamily", e.target.value)}
              className="bg-background rounded border px-2 py-1 text-sm"
            >
              <option value="Consolas">Consolas</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Cascadia Code">Cascadia Code</option>
              <option value="Microsoft YaHei">Microsoft YaHei</option>
              <option value="monospace">System monospace</option>
            </select>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayLocked")}
            description={t("settings.aion2.overlayLockedDesc")}
          >
            <Switch
              checked={config.aion2.overlay.locked}
              onCheckedChange={(v) => updateSettings("aion2.overlay.locked", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayAlwaysOnTop")}
            description={t("settings.aion2.overlayAlwaysOnTopDesc")}
          >
            <Switch
              checked={config.aion2.overlay.alwaysOnTop}
              onCheckedChange={(v) => updateSettings("aion2.overlay.alwaysOnTop", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.autoHideEnabled")}
            description={t("settings.aion2.autoHideEnabledDesc")}
          >
            <Switch
              checked={config.aion2.autoHideEnabled}
              onCheckedChange={(v) => updateSettings("aion2.autoHideEnabled", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayAutoResizeHeight")}
            description={t("settings.aion2.overlayAutoResizeHeightDesc")}
          >
            <Switch
              checked={config.aion2.overlay.autoResizeHeight}
              onCheckedChange={(v) => updateSettings("aion2.overlay.autoResizeHeight", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayContentScale")}
            description={t("settings.aion2.overlayContentScaleDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="70"
                max="150"
                step="5"
                value={Math.round(config.aion2.overlay.contentScale * 100)}
                onChange={(e) =>
                  updateSettings("aion2.overlay.contentScale", Number(e.target.value) / 100)
                }
                className="w-24"
              />
              <span className="w-10 text-right text-sm tabular-nums">
                {Math.round(config.aion2.overlay.contentScale * 100)}%
              </span>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayBackgroundOpacity")}
            description={t("settings.aion2.overlayBackgroundOpacityDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(config.aion2.overlay.background[3] / 2.55)}
                onChange={(e) => {
                  const a = Math.round(Number(e.target.value) * 2.55);
                  updateSettings("aion2.overlay.background", [
                    ...config.aion2.overlay.background.slice(0, 3),
                    a,
                  ] as RGBA);
                }}
                className="w-24"
              />
              <span className="w-8 text-right text-sm tabular-nums">
                {Math.round(config.aion2.overlay.background[3] / 2.55)}%
              </span>
            </div>
          </SettingRow>

          <SettingRow title={t("settings.aion2.overlayShowBossHp")} description="">
            <Switch
              checked={config.aion2.overlay.showBossHp}
              onCheckedChange={(v) => updateSettings("aion2.overlay.showBossHp", v)}
            />
          </SettingRow>

          <SettingRow title={t("settings.aion2.overlayMaskNicknames")} description="">
            <Switch
              checked={config.aion2.overlay.maskNicknames}
              onCheckedChange={(v) => updateSettings("aion2.overlay.maskNicknames", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayMainPlayerColor")}
            description={t("settings.aion2.overlayMainPlayerColorDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={rgbToHex(config.aion2.overlay.mainPlayerColor)}
                onChange={(e) =>
                  updateSettings("aion2.overlay.mainPlayerColor", [
                    ...hexToRgba(e.target.value).slice(0, 3),
                    config.aion2.overlay.mainPlayerColor[3],
                  ] as RGBA)
                }
                className="h-8 w-8 cursor-pointer rounded border-0"
              />
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(config.aion2.overlay.mainPlayerColor[3] / 2.55)}
                onChange={(e) =>
                  updateSettings("aion2.overlay.mainPlayerColor", [
                    ...config.aion2.overlay.mainPlayerColor.slice(0, 3),
                    Math.round(Number(e.target.value) * 2.55),
                  ] as RGBA)
                }
                className="w-20"
              />
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayOtherPlayerColor")}
            description={t("settings.aion2.overlayOtherPlayerColorDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={rgbToHex(config.aion2.overlay.otherPlayerColor)}
                onChange={(e) =>
                  updateSettings("aion2.overlay.otherPlayerColor", [
                    ...hexToRgba(e.target.value).slice(0, 3),
                    config.aion2.overlay.otherPlayerColor[3],
                  ] as RGBA)
                }
                className="h-8 w-8 cursor-pointer rounded border-0"
              />
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(config.aion2.overlay.otherPlayerColor[3] / 2.55)}
                onChange={(e) =>
                  updateSettings("aion2.overlay.otherPlayerColor", [
                    ...config.aion2.overlay.otherPlayerColor.slice(0, 3),
                    Math.round(Number(e.target.value) * 2.55),
                  ] as RGBA)
                }
                className="w-20"
              />
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayShowPlayerName")}
            description={t("settings.aion2.overlayShowPlayerNameDesc")}
          >
            <Switch
              checked={config.aion2.overlay.showPlayerName}
              onCheckedChange={(v) => updateSettings("aion2.overlay.showPlayerName", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayShowServer")}
            description={t("settings.aion2.overlayShowServerDesc")}
          >
            <Switch
              checked={config.aion2.overlay.showServer}
              onCheckedChange={(v) => updateSettings("aion2.overlay.showServer", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayShowDamage")}
            description={t("settings.aion2.overlayShowDamageDesc")}
          >
            <Switch
              checked={config.aion2.overlay.showDamage}
              onCheckedChange={(v) => updateSettings("aion2.overlay.showDamage", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayShowDps")}
            description={t("settings.aion2.overlayShowDpsDesc")}
          >
            <Switch
              checked={config.aion2.overlay.showDps}
              onCheckedChange={(v) => updateSettings("aion2.overlay.showDps", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayDamageFormat")}
            description={t("settings.aion2.overlayDamageFormatDesc")}
          >
            <div className="flex gap-2">
              <Button
                variant={config.aion2.overlay.damageFormat === "万/亿" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.damageFormat", "万/亿")}
              >
                w/e
              </Button>
              <Button
                variant={config.aion2.overlay.damageFormat === "K/M/B" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.damageFormat", "K/M/B")}
              >
                K/M/B
              </Button>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayPctMode")}
            description={t("settings.aion2.overlayPctModeDesc")}
          >
            <div className="flex gap-2">
              <Button
                variant={config.aion2.overlay.pctMode === "contribution" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.pctMode", "contribution")}
              >
                {t("settings.aion2.overlayPctContribution")}
              </Button>
              <Button
                variant={config.aion2.overlay.pctMode === "share" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.pctMode", "share")}
              >
                {t("settings.aion2.overlayPctShare")}
              </Button>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayDetailWindowMode")}
            description={t("settings.aion2.overlayDetailWindowModeDesc")}
          >
            <div className="flex gap-2">
              <Button
                variant={config.aion2.overlay.detailWindowMode === "follow" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.detailWindowMode", "follow")}
              >
                {t("settings.aion2.overlayDetailWindowFollow")}
              </Button>
              <Button
                variant={config.aion2.overlay.detailWindowMode === "center" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.overlay.detailWindowMode", "center")}
              >
                {t("settings.aion2.overlayDetailWindowCenter")}
              </Button>
            </div>
          </SettingRow>
        </SettingsGroup>
      )}

      {/* Buff monitor tab */}
      {tab === "buff" && (
        <div className="flex flex-col gap-4">
          <SettingsGroup title={t("settings.aion2.buffMonitor")}>
            <SettingRow
              title={t("settings.aion2.buffMonitorEnabled")}
              description={t("settings.aion2.buffMonitorEnabledDesc")}
            >
              <Switch
                checked={config.aion2.buffMonitor.enabled}
                onCheckedChange={(v) => updateSettings("aion2.buffMonitor.enabled", v)}
              />
            </SettingRow>

            <SettingRow
              title={t("settings.aion2.buffMonitorShowOnlyActive")}
              description={t("settings.aion2.buffMonitorShowOnlyActiveDesc")}
            >
              <Switch
                checked={config.aion2.buffMonitor.showOnlyActive}
                onCheckedChange={(v) => updateSettings("aion2.buffMonitor.showOnlyActive", v)}
              />
            </SettingRow>

            <SettingRow
              title={t("settings.aion2.buffMonitorIconStyle")}
              description={t("settings.aion2.buffMonitorIconStyleDesc")}
            >
              <div className="flex gap-2">
                <Button
                  variant={buffIconStyle === "style1" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSettings("aion2.buffMonitor.iconStyle", "style1")}
                >
                  {t("settings.aion2.buffMonitorIconStyle1")}
                </Button>
                <Button
                  variant={buffIconStyle === "style2" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSettings("aion2.buffMonitor.iconStyle", "style2")}
                >
                  {t("settings.aion2.buffMonitorIconStyle2")}
                </Button>
              </div>
            </SettingRow>

            <SettingRow
              title={t("settings.aion2.buffMonitorIconSize")}
              description={t("settings.aion2.buffMonitorIconSizeDesc")}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="24"
                  max="64"
                  step="2"
                  value={config.aion2.buffMonitor.iconSize}
                  onChange={(e) =>
                    updateSettings("aion2.buffMonitor.iconSize", Number(e.target.value))
                  }
                  className="w-24"
                />
                <span className="w-12 text-right text-sm tabular-nums">
                  {config.aion2.buffMonitor.iconSize}px
                </span>
              </div>
            </SettingRow>

            <SettingRow
              title={t("settings.aion2.buffMonitorIconGap")}
              description={t("settings.aion2.buffMonitorIconGapDesc")}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={config.aion2.buffMonitor.iconGap}
                  onChange={(e) =>
                    updateSettings("aion2.buffMonitor.iconGap", Number(e.target.value))
                  }
                  className="w-24"
                />
                <span className="w-12 text-right text-sm tabular-nums">
                  {config.aion2.buffMonitor.iconGap}px
                </span>
              </div>
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title={t("settings.aion2.buffMonitorClassPreferences")}>
            <div className="flex min-h-[72px] flex-col gap-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {ACTOR_CLASSES.map((actorClass) => (
                  <Button
                    key={actorClass}
                    variant={buffActorClass === actorClass ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setBuffActorClass(actorClass);
                      setBuffCandidateClass(actorClass);
                      setEditingBuffSlot(null);
                    }}
                  >
                    <img
                      src={`/aion2/class/${actorClass.toLowerCase()}.png`}
                      alt=""
                      className="size-4 rounded-sm"
                    />
                    {ACTOR_CLASS_NAMES[actorClass]}
                  </Button>
                ))}
              </div>

              <div className="bg-muted/20 rounded-lg border p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {t("settings.aion2.buffMonitorPreview")}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {ACTOR_CLASS_NAMES[buffActorClass]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={addBuffRow}>
                      {t("settings.aion2.buffMonitorAddRow")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={clearBuffLayout}>
                      {t("settings.aion2.buffMonitorClearLayout")}
                    </Button>
                  </div>
                </div>

                <div className="bg-background/70 flex min-h-20 flex-col gap-2 rounded-md p-3">
                  {activeBuffLayout.rows.length > 0 ? (
                    activeBuffLayout.rows.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          "flex items-center rounded-md border p-1 transition-colors",
                          editingBuffSlot?.rowId === row.id
                            ? "border-primary/60 bg-primary/10 animate-pulse border shadow-[0_0_0_1px_hsl(var(--primary)/0.18),0_0_18px_hsl(var(--primary)/0.18)]"
                            : "border-transparent bg-transparent"
                        )}
                        style={{ gap: `${config.aion2.buffMonitor.iconGap}px` }}
                      >
                        {row.slots.map((slot) =>
                          slot.type === "empty" ? (
                            <div key={slot.id} className="group relative">
                              <button
                                type="button"
                                className={cn(
                                  "border-muted-foreground/25 bg-muted/30 border border-dashed",
                                  buffIconStyle === "style2" ? "rounded-full" : "rounded-md",
                                  editingBuffSlot?.slotId === slot.id && "ring-primary ring-2"
                                )}
                                style={{
                                  width: `${config.aion2.buffMonitor.iconSize}px`,
                                  height: `${config.aion2.buffMonitor.iconSize}px`,
                                }}
                                onClick={() => {
                                  setEditingBuffSlot({ rowId: row.id, slotId: slot.id });
                                }}
                              />
                              <button
                                type="button"
                                className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-100"
                                onClick={() => removeBuffSlot(row.id, slot.id)}
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <div key={slot.id} className="group relative">
                              <button
                                type="button"
                                className={cn(
                                  "bg-muted relative overflow-hidden border",
                                  buffIconStyle === "style2"
                                    ? "rounded-full border-2 border-white/85 shadow-[0_3px_0_rgba(15,23,42,0.42),0_5px_10px_rgba(0,0,0,0.32),inset_0_0_7px_rgba(0,0,0,0.55)]"
                                    : "rounded-md",
                                  slot.type === "bossDebuff"
                                    ? "border-red-400/60"
                                    : "border-emerald-400/60",
                                  editingBuffSlot?.slotId === slot.id && "ring-primary ring-2"
                                )}
                                title={`${skillName(slot.skillCode ?? "")} (${skillShortcode(
                                  slot.skillCode ?? ""
                                )})`}
                                style={{
                                  width: `${config.aion2.buffMonitor.iconSize}px`,
                                  height: `${config.aion2.buffMonitor.iconSize}px`,
                                }}
                                onClick={() => {
                                  setEditingBuffSlot({ rowId: row.id, slotId: slot.id });
                                  setBuffPickerType(
                                    slot.type === "bossDebuff" ? "bossDebuff" : "selfBuff"
                                  );
                                }}
                              >
                                <img
                                  src={skillIconSrc(slot.skillCode ?? "")}
                                  alt=""
                                  className={cn(
                                    "size-full object-cover",
                                    buffIconStyle === "style2" && "rounded-full"
                                  )}
                                />
                                <span
                                  className={cn(
                                    "bg-background/80 absolute font-mono text-[9px] leading-3",
                                    buffIconStyle === "style2"
                                      ? "-right-1 -bottom-1 min-w-6 rounded-full border border-white/30 px-1.5 py-0.5 text-center shadow-sm"
                                      : "right-0.5 bottom-0.5 rounded px-1"
                                  )}
                                >
                                  {skillShortcode(slot.skillCode ?? "")}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-100"
                                onClick={() => removeBuffSlot(row.id, slot.id)}
                              >
                                ×
                              </button>
                            </div>
                          )
                        )}
                        <button
                          type="button"
                          className={cn(
                            "border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground grid shrink-0 place-items-center border border-dashed",
                            buffIconStyle === "style2" ? "rounded-full" : "rounded-md",
                            editingBuffSlot?.rowId === row.id &&
                              !editingBuffSlot.slotId &&
                              "ring-primary ring-2"
                          )}
                          title={t("settings.aion2.buffMonitorAddSelfBuff")}
                          style={{
                            width: `${config.aion2.buffMonitor.iconSize}px`,
                            height: `${config.aion2.buffMonitor.iconSize}px`,
                          }}
                          onClick={() => setEditingBuffSlot({ rowId: row.id })}
                        >
                          +
                        </button>
                        {activeBuffLayout.rows.length > 1 && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid size-6 shrink-0 place-items-center rounded-md"
                            title={t("settings.aion2.buffMonitorRemoveRow")}
                            onClick={() => removeBuffRow(row.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground flex min-h-16 items-center justify-center text-xs">
                      {t("settings.aion2.buffMonitorNoSkills")}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={buffPickerType === "selfBuff" ? "default" : "outline"}
                      onClick={() => setBuffPickerType("selfBuff")}
                    >
                      {t("settings.aion2.buffMonitorAddSelfBuff")}
                    </Button>
                    <Button
                      size="sm"
                      variant={buffPickerType === "bossDebuff" ? "default" : "outline"}
                      onClick={() => setBuffPickerType("bossDebuff")}
                    >
                      {t("settings.aion2.buffMonitorAddBossDebuff")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => upsertBuffSlot("empty")}>
                      {t("settings.aion2.buffMonitorAddEmptySlot")}
                    </Button>
                  </div>
                  {editingBuffSlot && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingBuffSlot(null);
                      }}
                    >
                      {t("settings.close")}
                    </Button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {editingBuffSlot && selectedBuffSlotId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBuffSlot(editingBuffSlot.rowId, selectedBuffSlotId)}
                    >
                      {t("settings.aion2.buffMonitorRemoveSlot")}
                    </Button>
                  )}
                </div>

                <div className="bg-muted/30 mt-3 rounded-md p-2">
                  <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                    {ACTOR_CLASSES.map((actorClass) => (
                      <button
                        key={actorClass}
                        type="button"
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs",
                          buffCandidateClass === actorClass
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground"
                        )}
                        onClick={() => setBuffCandidateClass(actorClass)}
                      >
                        <img
                          src={`/aion2/class/${actorClass.toLowerCase()}.png`}
                          alt=""
                          className="size-4 rounded-sm"
                        />
                        {ACTOR_CLASS_NAMES[actorClass]}
                      </button>
                    ))}
                  </div>

                  {activePickerCandidates.length > 0 ? (
                    <div className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 overflow-auto pr-1">
                      {activePickerCandidates.map((skillCode) => (
                        <button
                          key={`${buffCandidateClass}-${skillCode}`}
                          type="button"
                          className={cn(
                            "bg-background hover:bg-muted flex min-w-0 items-center gap-2 rounded-md border p-2 text-left text-xs",
                            buffPickerType === "bossDebuff"
                              ? "border-red-400/25"
                              : "border-emerald-400/25"
                          )}
                          title={`${skillName(skillCode)} (${skillCode})`}
                          onClick={() => upsertBuffSlot(buffPickerType, skillCode)}
                        >
                          <img
                            src={skillIconSrc(skillCode)}
                            alt=""
                            className="size-7 rounded object-cover"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{skillName(skillCode)}</span>
                            <span className="text-muted-foreground font-mono">{skillCode}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex min-h-24 items-center justify-center text-xs">
                      {t("settings.aion2.buffMonitorNoSkills")}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-muted-foreground text-xs leading-5">
                {t("settings.aion2.buffMonitorStorageDesc")}
              </div>
            </div>
          </SettingsGroup>
        </div>
      )}

      {/* Backend tab */}
      {tab === "backend" && (
        <SettingsGroup title={t("settings.aion2.backend")}>
          <SettingRow
            title={t("settings.aion2.captureBackendPriority")}
            description={t("settings.aion2.captureBackendPriorityDesc")}
          >
            <div className="flex gap-2">
              <Button
                variant={
                  config.aion2.backend.captureBackendPriority === "winDivertFirst"
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  updateSettings("aion2.backend.captureBackendPriority", "winDivertFirst")
                }
              >
                {t("settings.aion2.captureBackendPriorityWinDivertFirst")}
              </Button>
              <Button
                variant={
                  config.aion2.backend.captureBackendPriority === "npcapFirst"
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => updateSettings("aion2.backend.captureBackendPriority", "npcapFirst")}
              >
                {t("settings.aion2.captureBackendPriorityNpcapFirst")}
              </Button>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.bossOnly")}
            description={t("settings.aion2.bossOnlyDesc")}
          >
            <Switch
              checked={config.aion2.backend.bossOnly}
              onCheckedChange={(v) => updateSettings("aion2.backend.bossOnly", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.showPossibleBoss")}
            description={t("settings.aion2.showPossibleBossDesc")}
          >
            <Switch
              checked={config.aion2.backend.showPossibleBoss}
              onCheckedChange={(v) => updateSettings("aion2.backend.showPossibleBoss", v)}
            />
          </SettingRow>

          {/* <SettingRow
            title={t("settings.aion2.pvpModeOn")}
            description={t("settings.aion2.pvpModeOnDesc")}
          >
            <Switch
              checked={config.aion2.backend.pvpModeOn}
              onCheckedChange={(v) => updateSettings("aion2.backend.pvpModeOn", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.pvpOverlayPosition")}
            description={t("settings.aion2.pvpOverlayPositionDesc")}
          >
            <div className="flex gap-2">
              <Button
                variant={
                  config.aion2.backend.pvpOverlayPosition === "bottom" ? "default" : "outline"
                }
                size="sm"
                onClick={() => updateSettings("aion2.backend.pvpOverlayPosition", "bottom")}
              >
                {t("settings.aion2.pvpOverlayPositionBottom")}
              </Button>
              <Button
                variant={
                  config.aion2.backend.pvpOverlayPosition === "right" ? "default" : "outline"
                }
                size="sm"
                onClick={() => updateSettings("aion2.backend.pvpOverlayPosition", "right")}
              >
                {t("settings.aion2.pvpOverlayPositionRight")}
              </Button>
              <Button
                variant={config.aion2.backend.pvpOverlayPosition === "free" ? "default" : "outline"}
                size="sm"
                onClick={() => updateSettings("aion2.backend.pvpOverlayPosition", "free")}
              >
                {t("settings.aion2.pvpOverlayPositionFree")}
              </Button>
            </div>
          </SettingRow> */}

          <SettingRow
            title={t("settings.aion2.myMuzhuangOnly")}
            description={t("settings.aion2.myMuzhuangOnlyDesc")}
          >
            <Switch
              checked={config.aion2.backend.myMuzhuangOnly}
              onCheckedChange={(v) => updateSettings("aion2.backend.myMuzhuangOnly", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayHideUnknownPlayers")}
            description={t("settings.aion2.overlayHideUnknownPlayersDesc")}
          >
            <Switch
              checked={config.aion2.backend.hideUnknownPlayers}
              onCheckedChange={(v) => updateSettings("aion2.backend.hideUnknownPlayers", v)}
            />
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.overlayMaxPlayerCount")}
            description={t("settings.aion2.overlayMaxPlayerCountDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="20"
                step="1"
                value={config.aion2.backend.maxPlayerCount}
                onChange={(e) =>
                  updateSettings("aion2.backend.maxPlayerCount", Number(e.target.value))
                }
                className="w-24"
              />
              <span className="w-6 text-right text-sm tabular-nums">
                {config.aion2.backend.maxPlayerCount}
              </span>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.dpsSnapshotInterval")}
            description={t("settings.aion2.dpsSnapshotIntervalDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={config.aion2.backend.dpsSnapshotIntervalMs}
                onChange={(e) =>
                  updateSettings("aion2.backend.dpsSnapshotIntervalMs", Number(e.target.value))
                }
                className="w-20"
              />
              <span className="w-10 text-right text-sm tabular-nums">
                {config.aion2.backend.dpsSnapshotIntervalMs}
              </span>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.maxPacketSizeThreshold")}
            description={t("settings.aion2.maxPacketSizeThresholdDesc")}
          >
            <select
              value={config.aion2.backend.maxPacketSizeThreshold}
              onChange={(e) =>
                updateSettings("aion2.backend.maxPacketSizeThreshold", Number(e.target.value))
              }
              className="bg-background rounded border px-2 py-1 text-sm"
            >
              <option value={2048}>2 KB</option>
              <option value={4096}>4 KB</option>
              <option value={8192}>8 KB</option>
              <option value={16384}>16 KB</option>
            </select>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.stallResyncDelay")}
            description={t("settings.aion2.stallResyncDelayDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={config.aion2.backend.stallResyncDelayMs}
                onChange={(e) =>
                  updateSettings("aion2.backend.stallResyncDelayMs", Number(e.target.value))
                }
                className="w-24"
              />
              <span className="w-14 text-right text-sm tabular-nums">
                {config.aion2.backend.stallResyncDelayMs}ms
              </span>
            </div>
          </SettingRow>

          <SettingRow
            title={t("settings.aion2.fullProcessorStallResyncDelay")}
            description={t("settings.aion2.fullProcessorStallResyncDelayDesc")}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={config.aion2.backend.fullProcessorStallResyncDelayMs}
                onChange={(e) =>
                  updateSettings(
                    "aion2.backend.fullProcessorStallResyncDelayMs",
                    Number(e.target.value)
                  )
                }
                className="w-24"
              />
              <span className="w-14 text-right text-sm tabular-nums">
                {config.aion2.backend.fullProcessorStallResyncDelayMs}ms
              </span>
            </div>
          </SettingRow>
        </SettingsGroup>
      )}
    </div>
  );
}
