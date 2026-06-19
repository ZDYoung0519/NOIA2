import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ShortcutInput } from "@/components/shortcut-input";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useSettings } from "@/hooks/use-settings";
import { SettingsGroup, SettingsRow as BaseSettingsRow } from "@/components/settings-layout";

type RGBA = [number, number, number, number];
type Aion2Tab = "shortcuts" | "overlay" | "backend";

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

export function Aion2Settings() {
  const { config, updateSettings } = useSettings();
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<Aion2Tab>("shortcuts");

  const tabs: { id: Aion2Tab; label: string }[] = [
    { id: "shortcuts", label: t("settings.aion2.shortcuts") },
    { id: "overlay", label: t("settings.aion2.overlay") },
    { id: "backend", label: t("settings.aion2.backend") },
  ];

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
            title={t("settings.aion2.overlayHideUnknownPlayers")}
            description={t("settings.aion2.overlayHideUnknownPlayersDesc")}
          >
            <Switch
              checked={config.aion2.overlay.hideUnknownPlayers}
              onCheckedChange={(v) => updateSettings("aion2.overlay.hideUnknownPlayers", v)}
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

      {/* Backend tab */}
      {tab === "backend" && (
        <SettingsGroup title={t("settings.aion2.backend")}>
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
            title={t("settings.aion2.myMuzhuangOnly")}
            description={t("settings.aion2.myMuzhuangOnlyDesc")}
          >
            <Switch
              checked={config.aion2.backend.myMuzhuangOnly}
              onCheckedChange={(v) => updateSettings("aion2.backend.myMuzhuangOnly", v)}
            />
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
            title={t("settings.aion2.enableResyncOnStall")}
            description={t("settings.aion2.enableResyncOnStallDesc")}
          >
            <Switch
              checked={config.aion2.backend.enableResyncOnStall}
              onCheckedChange={(v) => updateSettings("aion2.backend.enableResyncOnStall", v)}
            />
          </SettingRow>
        </SettingsGroup>
      )}
    </div>
  );
}
