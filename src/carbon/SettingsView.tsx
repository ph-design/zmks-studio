import { Info, FileText, RotateCcw } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { SettingsBlock, secBtn, normalizeLang } from "./CarbonChrome";

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
  roundedCorners: boolean;
  setRoundedCorners: (v: boolean) => void;
}

export function SettingsView({ th, t, setting, setSetting, lang, setLang, defaultNav, setDefaultNav, navOptions, onShowAbout, onShowLicense, onResetSettings, roundedCorners, setRoundedCorners }: SettingsViewProps) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      <h2 style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary, marginBottom: 20 }}>{t("carbon.nav.settings", "Settings")}</h2>
      <SettingsBlock th={th} label={t("carbon.theme", "Theme")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {([
            { id: "system", label: t("carbon.themeSystem", "System") },
            { id: "light", label: t("carbon.lightTheme", "Light") },
            { id: "dark", label: t("carbon.darkTheme", "Dark") },
          ] as const).map((o) => (
            <button key={o.id} onClick={() => setSetting(o.id)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: setting === o.id ? th.interactive : th.fieldBg, color: setting === o.id ? "#fff" : th.textSecondary, border: `1px solid ${setting === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </SettingsBlock>
      <SettingsBlock th={th} label={t("carbon.roundedCorners", "圆角！(beta)")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setRoundedCorners(true)}
            style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: roundedCorners ? th.interactive : th.fieldBg, color: roundedCorners ? "#fff" : th.textSecondary, border: `1px solid ${roundedCorners ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
            {t("carbon.roundedOnBtn", "开")}
          </button>
          <button onClick={() => setRoundedCorners(false)}
            style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: !roundedCorners ? th.interactive : th.fieldBg, color: !roundedCorners ? "#fff" : th.textSecondary, border: `1px solid ${!roundedCorners ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
            {t("carbon.roundedOffBtn", "关")}
          </button>
        </div>
        <span style={{ fontSize: 12, color: th.textHelper, display: "block", marginTop: 8 }}>
          {roundedCorners ? t("carbon.roundedOn", "已开启 — 所有界面元素使用圆角") : t("carbon.roundedOff", "已关闭")}
        </span>
      </SettingsBlock>
      <SettingsBlock th={th} label={t("carbon.language", "Language")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {([
            { id: "en", label: "English" },
            { id: "zh", label: "中文" },
            { id: "ja", label: "日本語" },
            { id: "fr", label: "Français" },
            { id: "es", label: "Español" },
          ] as const).map((o) => (
            <button key={o.id} onClick={() => setLang(o.id)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: normalizeLang(lang) === o.id ? th.interactive : th.fieldBg, color: normalizeLang(lang) === o.id ? "#fff" : th.textSecondary, border: `1px solid ${normalizeLang(lang) === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
              {o.label}
            </button>
          ))}
        </div>
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
