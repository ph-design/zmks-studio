import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDongle, type DongleController } from "./useDongle";

interface ReceiverSession { dongle: DongleController; selectedSlot?: 0 | 1; selectSlot: (slot: 0 | 1) => void }
const ReceiverContext = createContext<ReceiverSession | null>(null);
export function ReceiverProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const dongle = useDongle(t);
  const [selectedSlot, selectSlot] = useState<0 | 1>();
  const latest = useRef(dongle); latest.current = dongle;
  useEffect(() => {
    if (dongle.phase !== "open") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (!document.hidden && !latest.current.busy) await latest.current.queryStatus(); }
      catch { /* The controller retains the actionable connection error. */ }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 1500); }
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [dongle.phase]);
  return <ReceiverContext.Provider value={{ dongle, selectedSlot, selectSlot }}>{children}</ReceiverContext.Provider>;
}
export function useReceiver() {
  const value = useContext(ReceiverContext);
  if (!value) throw new Error("ReceiverProvider is missing");
  return value;
}
