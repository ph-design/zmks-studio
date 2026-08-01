import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";
import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";

// Fetches every combo once per connection
export function useCombos() {
  const { conn } = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const unlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!conn || !unlocked) return;
    const gen = generation.current;
    try {
      const resp = await call_rpc(conn, { combos: { listAllCombos: true } });
      if (generation.current !== gen) return;
      const list = resp.combos?.listAllCombos?.combos ?? [];
      setCombos(list);
      setLoaded(true);
    } catch {
      if (generation.current !== gen) return;
      setCombos([]);
      setLoaded(false);
    }
  }, [conn, unlocked]);

  useEffect(() => {
    generation.current++;
    setCombos([]);
    setLoaded(false);
    refresh();
  }, [conn, unlocked, refresh]);

  /**
   * Reads one slot straight from firmware, bypassing the optimistic local copy.
   * Needed when the question is "did the write actually land", which the local
   * state can't answer because it assumes success.
   */
  const readCombo = useCallback(
    async (index: number): Promise<ComboConfig | null> => {
      if (!conn) return null;
      try {
        const resp = await call_rpc(conn, { combos: { getCombo: { index } } });
        return resp.combos?.getCombo ?? null;
      } catch {
        return null;
      }
    },
    [conn]
  );

  const applyConfig = useCallback(
    async (config: ComboConfig): Promise<boolean> => {
      if (!conn) return false;
      try {
        const resp = await call_rpc(conn, {
          combos: { setCombo: { index: config.index, combo: config } },
        });
        const ok = resp.combos?.setCombo?.ok === true;
        if (ok) {
          setCombos((prev) =>
            prev.map((c) => (c.index === config.index ? config : c))
          );
        }
        return ok;
      } catch {
        return false;
      }
    },
    [conn]
  );

  return { combos, loaded, applyConfig, readCombo, refresh };
}

export function combosEqual(a: ComboConfig, b: ComboConfig): boolean {
  return (
    a.timeoutMs === b.timeoutMs &&
    a.requirePriorIdleMs === b.requirePriorIdleMs &&
    a.slowRelease === b.slowRelease &&
    a.layerMask === b.layerMask &&
    a.keyPositions.length === b.keyPositions.length &&
    a.keyPositions.every((p, i) => p === b.keyPositions[i]) &&
    (a.behavior?.behaviorId ?? -1) === (b.behavior?.behaviorId ?? -1) &&
    (a.behavior?.param1 ?? 0) === (b.behavior?.param1 ?? 0) &&
    (a.behavior?.param2 ?? 0) === (b.behavior?.param2 ?? 0)
  );
}
