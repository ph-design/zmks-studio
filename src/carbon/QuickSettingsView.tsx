import { Cpu } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { PhysicalLayoutPicker } from "../keyboard/PhysicalLayoutPicker";
import { SegmentedControl, SettingsBlock, normalizeLang } from "./CarbonChrome";

type NavId = "keyboard" | "layers" | "behaviors" | "lighting" | "combos" | "settings";

interface QuickSettingsViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  deviceName: string;
  serial?: string;
  setting: string;
  setSetting: (s: "dark" | "light" | "system") => void;
  lang: string;
  setLang: (l: string) => void;
  defaultNav: NavId;
  setDefaultNav: (n: NavId) => void;
  navOptions: { id: NavId; label: string }[];
}

export function QuickSettingsView({ model, th, t, deviceName, serial, setting, setSetting, lang, setLang, defaultNav, setDefaultNav, navOptions }: QuickSettingsViewProps) {
  const rows: [string, string][] = [
    [t("carbon.deviceName", "Device name"), deviceName],
    ...(serial ? [[t("carbon.serialNumber", "Serial number"), serial] as [string, string]] : []),
    [t("carbon.layoutCount", "Physical layouts"), String(model.layouts?.length ?? 0)],
    [t("carbon.layerCount", "Layers"), String(model.keymap?.layers.length ?? 0)],
  ];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, background: th.layer2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Cpu size={24} style={{ color: th.interactive }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: th.textPrimary }}>{deviceName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: th.success }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: th.success }} />
            {t("carbon.statusConnected", "Device connected")}
          </div>
        </div>
      </div>
      <div style={{ border: `1px solid ${th.border}` }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", padding: "10px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${th.border}` : "none", background: i % 2 === 0 ? th.layer1 : th.bg }}>
            <span style={{ width: 140, fontSize: 13, color: th.textHelper, flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: 13, color: th.textPrimary, fontFamily: "var(--font-mono)", minWidth: 0, wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
      </div>

      {model.layouts && model.layouts.length > 1 &&
        <SettingsBlock th={th} label={t("carbon.activeLayout", "Active layout")}>
          <PhysicalLayoutPicker layouts={model.layouts} selectedPhysicalLayoutIndex={model.selectedPhysicalLayoutIndex} onPhysicalLayoutClicked={model.doSelectPhysicalLayout} />
        </SettingsBlock>
      }

      {/* Quick controls — streamlined duplicates of the most-used settings */}
      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper, paddingTop: 12 }}>
        {t("carbon.quickControls", "QUICK CONTROLS")}
      </div>
      <SettingsBlock th={th} label={t("carbon.theme", "Theme")}>
        <SegmentedControl th={th} opts={[
          { id: "system", label: t("carbon.themeSystem", "System") },
          { id: "light", label: t("carbon.lightTheme", "Light") },
          { id: "dark", label: t("carbon.darkTheme", "Dark") },
        ]} value={setting} onChange={(v) => setSetting(v as "dark" | "light" | "system")} />
      </SettingsBlock>
      <SettingsBlock th={th} label={t("carbon.language", "Language")}>
        <SegmentedControl th={th} opts={[
          { id: "en", label: "English" },
          { id: "zh", label: "中文" },
          { id: "ja", label: "日本語" },
          { id: "fr", label: "Français" },
          { id: "es", label: "Español" },
        ]} value={normalizeLang(lang)} onChange={setLang} />
      </SettingsBlock>
      <div style={{ padding: "16px 0" }}>
        <div style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500, marginBottom: 8 }}>{t("carbon.defaultView", "Default view")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {navOptions.map((o) => (
            <button key={o.id} onClick={() => setDefaultNav(o.id)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: defaultNav === o.id ? th.interactive : th.fieldBg, color: defaultNav === o.id ? "#fff" : th.textSecondary, border: `1px solid ${defaultNav === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
