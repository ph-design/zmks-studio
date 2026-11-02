import { Info, FileText, Check } from "lucide-react";

import { ACCENT_PRESETS, type CarbonTheme } from "./theme";
import { SettingsBlock, ContentSwitcher, Select, ActionButton } from "./CarbonChrome";
import { normalizeLang, SUPPORTED_LANGUAGES } from "../i18n";
import type { NavId } from "./navIds";

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
}

export function PreferencesView({ th, t, setting, setSetting, accent, setAccent, lang, setLang, defaultNav, setDefaultNav, navOptions, onShowAbout, onShowLicense }: PreferencesViewProps) {
  return (
    <div className="carbon-editor-scroll custom-scrollbar">
      <div className="mr-auto w-full max-w-[920px]">
      <h2 className="mb-5 text-base font-semibold text-base-content">{t("carbon.nav.preferences", "Preferences")}</h2>

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

      <SettingsBlock th={th} label={t("carbon.accentColor", "Accent color")}>
        <p className="-mt-1 mb-2.5 text-xs text-helper">
          {t("carbon.accentColorDesc", "Carbon interactive colors — used for selections, links and primary buttons.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => {
            const active = accent === p.id;
            return (
              <button key={p.id} onClick={() => setAccent(p.id)} aria-pressed={active}
                title={t(`carbon.accent.${p.id}`, p.id)}
                className={`flex h-[30px] w-[30px] items-center justify-center border-2 ${active ? "border-base-content" : "border-base-300"}`}
                style={{ background: p.hex }}>
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
          opts={SUPPORTED_LANGUAGES}
          onChange={setLang} />
      </SettingsBlock>

      <SettingsBlock th={th} label={t("carbon.defaultView", "Default view")}>
        <p className="-mt-1 mb-2 text-xs text-helper">
          {t("carbon.defaultViewDesc", "Which section opens when you connect a keyboard.")}
        </p>
        <Select th={th}
          label={t("carbon.defaultView", "Default view")}
          value={defaultNav}
          opts={navOptions}
          onChange={setDefaultNav} />
      </SettingsBlock>

      <SettingsBlock th={th} label={t("carbon.about", "About")}>
        <div className="flex gap-2">
          <ActionButton th={th} onClick={onShowAbout} icon={<Info size={13} />} label={t("carbon.aboutApp", "About ZMK Studio")} />
          <ActionButton th={th} onClick={onShowLicense} icon={<FileText size={13} />} label={t("carbon.license", "License")} />
        </div>
      </SettingsBlock>
      </div>
    </div>
  );
}
