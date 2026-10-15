import { useState } from "react";
import { Info, FileText, Check, ClipboardCheck } from "lucide-react";

import { ACCENT_PRESETS, type CarbonTheme } from "./theme";
import { SettingsBlock, ContentSwitcher, Select, secBtn, normalizeLang } from "./CarbonChrome";
import type { NavId } from "./navIds";
import { useFactoryConfig } from "../factory/factoryConfig";

/*
 * App preferences only — nothing here talks to the keyboard. Device-side state
 * (identity, active layout, unlock shortcut, factory reset) lives in DeviceView.
 */
interface PreferencesViewProps {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  setting: string;
  setSetting: (s: "dark" | "light" | "system") => void;
  accent: string;
  setAccent: (a: string) => void;
  lang: string;
  setLang: (l: string) => void;
  defaultNav: NavId;
  setDefaultNav: (n: NavId) => void;
  navOptions: { id: NavId; label: string }[];
  onShowAbout: () => void;
  onShowLicense: () => void;
  /** Opens the pre-shipment test flow; see src/factory/FactoryApp.tsx. */
  onEnterFactoryMode: () => void;
}

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
];

export function PreferencesView({ th, t, setting, setSetting, accent, setAccent, lang, setLang, defaultNav, setDefaultNav, navOptions, onShowAbout, onShowLicense, onEnterFactoryMode }: PreferencesViewProps) {
  const [factoryConfig] = useFactoryConfig();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  /*
   * The bench entry.
   *
   * A shipped build must not advertise a production test flow, so the row reads
   * as an ordinary settings block and the PIN is what actually opens it — the
   * default is in `DEFAULT_FACTORY_CONFIG` and a bench is expected to change it.
   * A wrong PIN says nothing about what it was protecting.
   */
  const submitPin = () => {
    if (pin === factoryConfig.pin) {
      setPinOpen(false);
      setPin("");
      setPinError(false);
      onEnterFactoryMode();
    } else {
      setPinError(true);
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      <h2 style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary, marginBottom: 20 }}>{t("carbon.nav.preferences", "Preferences")}</h2>

      <SettingsBlock th={th} label={t("carbon.theme", "Theme")}>
        <ContentSwitcher th={th}
          label={t("carbon.theme", "Theme")}
          value={setting}
          opts={[
            { id: "system", label: t("carbon.themeSystem", "System") },
            { id: "light", label: t("carbon.lightTheme", "Light") },
            { id: "dark", label: t("carbon.darkTheme", "Dark") },
          ]}
          onChange={(v) => setSetting(v as "dark" | "light" | "system")} />
      </SettingsBlock>

      {/* Swatches, not a switcher — the choice *is* the color, so a label would
          only restate it. */}
      <SettingsBlock th={th} label={t("carbon.accentColor", "Accent color")}>
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: -4, marginBottom: 10 }}>
          {t("carbon.accentColorDesc", "Carbon interactive colors — used for selections, links and primary buttons.")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {ACCENT_PRESETS.map((p) => {
            const active = accent === p.id;
            return (
              <button key={p.id} onClick={() => setAccent(p.id)} aria-pressed={active}
                title={t(`carbon.accent.${p.id}`, p.id)}
                style={{ width: 30, height: 30, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: p.hex, cursor: "pointer", border: `2px solid ${active ? th.textPrimary : th.border}` }}>
                {active && <Check size={15} color="#fff" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </SettingsBlock>

      <SettingsBlock th={th} label={t("carbon.language", "Language")}>
        <ContentSwitcher th={th}
          label={t("carbon.language", "Language")}
          value={normalizeLang(lang)}
          opts={LANGUAGES}
          onChange={setLang} />
      </SettingsBlock>

      {/* A Select rather than a switcher: this list grows with the keyboard's
          capabilities and already runs past Carbon's five-item ceiling. */}
      <SettingsBlock th={th} label={t("carbon.defaultView", "Default view")}>
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: -4, marginBottom: 8 }}>
          {t("carbon.defaultViewDesc", "Which section opens when you connect a keyboard.")}
        </p>
        <Select th={th}
          label={t("carbon.defaultView", "Default view")}
          value={defaultNav}
          opts={navOptions}
          onChange={setDefaultNav} />
      </SettingsBlock>

      <SettingsBlock th={th} label={t("carbon.about", "About")}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onShowAbout} style={secBtn(th)}><Info size={13} />{t("carbon.aboutApp", "About ZMK Studio")}</button>
          <button onClick={onShowLicense} style={secBtn(th)}><FileText size={13} />{t("carbon.license", "License")}</button>
        </div>
      </SettingsBlock>

      <SettingsBlock th={th} label={t("factory.entry.section", "产线")}>
        {!pinOpen ? (
          <button onClick={() => { setPinError(false); setPinOpen(true); }} style={secBtn(th)}>
            <ClipboardCheck size={13} />{t("factory.entry.open", "工厂测试")}
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              placeholder={t("factory.entry.pin", "PIN")}
              onChange={(e) => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
              style={{
                height: 32, width: 120, padding: "0 10px", fontSize: 13,
                fontFamily: "var(--font-mono)", background: th.fieldBg,
                color: th.textPrimary, border: `1px solid ${pinError ? th.error : th.border}`,
                outline: "none",
              }}
            />
            <button onClick={submitPin} style={secBtn(th)}>{t("factory.entry.submit", "进入")}</button>
            <button onClick={() => { setPinOpen(false); setPin(""); setPinError(false); }} style={secBtn(th)}>
              {t("common.cancel", "取消")}
            </button>
            {pinError && (
              <span style={{ fontSize: 12, color: th.error }}>{t("factory.entry.wrong", "PIN 不正确")}</span>
            )}
          </div>
        )}
      </SettingsBlock>
    </div>
  );
}
