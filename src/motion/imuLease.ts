// One renewal at a time; late replies after teardown are followed by a stop.
export function maintainImuLease(
  mode: (on: boolean) => Promise<boolean>,
  onLost: () => void,
  delay = 900,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const renew = async () => {
    try {
      const ok = await mode(true);
      if (stopped) {
        if (ok) await mode(false);
      } else if (!ok) {
        stopped = true;
        onLost();
      }
    } catch {
      if (!stopped) {
        stopped = true;
        onLost();
      }
    } finally {
      if (!stopped) timer = setTimeout(() => void renew(), delay);
    }
  };
  timer = setTimeout(() => void renew(), delay);
  return () => {
    stopped = true;
    clearTimeout(timer);
    void mode(false).catch(() => {});
  };
}
