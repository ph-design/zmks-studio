import { Info, FileText, RotateCcw } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { SegmentedControl, SettingsBlock, secBtn, normalizeLang } from "./CarbonChrome";

type NavId = "keyboard" | "layers" | "behaviors" | "lighting" | "combos" | "settings";

interface SettingsViewProps {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  setting: string;
  setSetting: (s: "dark" | "light" | "system") => void;
  lang: string;
  setLang: (l: string) => void;
  defaultNav: NavId;
  setDefaultNav: (n: NavId) => void;
  navOptions: { id: NavId; label: string }[];
  onShowAbout: () => void;
  onShowLicense: () => void;
  onResetSettings: () => void;
}

export function SettingsView({ th, t, setting, setSetting, lang, setLang, defaultNav, setDefaultNav, navOptions, onShowAbout, onShowLicense, onResetSettings }: SettingsViewProps) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      <h2 style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary, marginBottom: 20 }}>{t("carbon.nav.settings", "Settings")}</h2>
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
      <SettingsBlock th={th} label={t("carbon.defaultView", "Default view")}>
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: -4, marginBottom: 8 }}>
          {t("carbon.defaultViewDesc", "Which section opens when you connect a keyboard.")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {navOptions.map((o) => (
            <button key={o.id} onClick={() => setDefaultNav(o.id)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: defaultNav === o.id ? th.interactive : th.fieldBg, color: defaultNav === o.id ? "#fff" : th.textSecondary, border: `1px solid ${defaultNav === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </SettingsBlock>
      <SettingsBlock th={th} label={t("carbon.about", "About")}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onShowAbout} style={secBtn(th)}><Info size={13} />{t("carbon.aboutApp", "About ZMK Studio")}</button>
          <button onClick={onShowLicense} style={secBtn(th)}><FileText size={13} />{t("carbon.license", "License")}</button>
        </div>
      </SettingsBlock>
      <div style={{ paddingTop: 20 }}>
        <button onClick={onResetSettings} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 13, background: "transparent", color: th.error, border: `1px solid ${th.error}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <RotateCcw size={14} />{t("carbon.factoryReset", "Restore stock settings")}
        </button>
      </div>
    </div>
  );
}
