import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
  variant?: "modal" | "floating";
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
  variant = "floating",
}: AppFooterProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  const scheduleHide = useCallback(() => {
    if (variant !== "floating") {
      return;
    }

    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
    }, 3000);
  }, [variant]);

  const showFooter = useCallback(() => {
    if (variant !== "floating") {
      return;
    }

    window.clearTimeout(hideTimer.current);
    setVisible(true);
  }, [variant]);

  useEffect(() => {
    if (variant !== "floating") {
      return;
    }

    setVisible(true);
    scheduleHide();
    return () => window.clearTimeout(hideTimer.current);
  }, [scheduleHide, variant]);

  const footerContent = (
    <div className="app-footer-content">
      <span>{t("footer.copyright")}</span> -{" "}
      <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
        {t("footer.about")}
      </a>{" "}
      -{" "}
      <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
        {t("footer.license")}
      </a>
    </div>
  );

  if (variant === "modal") {
    return (
      <div className="app-footer app-footer-modal">
        {footerContent}
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-30 h-2"
        onMouseEnter={() => {
          showFooter();
          scheduleHide();
        }}
        aria-hidden="true"
      />
      <div
        className={`app-footer app-footer-floating ${
          visible ? "app-footer-floating-visible" : "app-footer-floating-hidden"
        }`}
        onMouseEnter={showFooter}
        onMouseLeave={scheduleHide}
      >
        {footerContent}
      </div>
    </>
  );
};
