import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import type { HoldTapConfig } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

// Tri-state cache: config | null (not hold-tap) | undefined (not fetched).
type ConfigCache = Record<number, HoldTapConfig | null | undefined>;

// Fetches & caches configs for connection lifetime; `requested` Set prevents duplicate RPCs.
export function useHoldTapConfigs(behaviorIds: number[]) {
  const { conn } = useContext(ConnectionContext);
  const [cache, setCache] = useState<ConfigCache>({});
  // Use ref not state so fetch guard avoids stale closure.
  const requested = useRef<Set<number>>(new Set());
  // Bumped on conn change; dropped responses can't pollute the next session.
  const generation = useRef(0);

  const fetchOne = useCallback(
    async (id: number) => {
      if (!conn) return;
      if (requested.current.has(id)) return;
      requested.current.add(id);
      const gen = generation.current;

      setCache((prev) => ({ ...prev, [id]: undefined }));

      try {
        const resp = await call_rpc(conn, {
          behaviors: { getBehaviorConfig: { behaviorId: id } },
        });
        if (generation.current !== gen) return;
        const ht = resp.behaviors?.getBehaviorConfig?.holdTap;
        setCache((prev) => ({ ...prev, [id]: ht ?? null }));
      } catch {
        if (generation.current !== gen) return;
        // Retry on next fetch pass.
        requested.current.delete(id);
        setCache((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [conn]
  );

  useEffect(() => {
    generation.current++;
    requested.current.clear();
    setCache({});
  }, [conn]);

  useEffect(() => {
    if (!conn) return;
    for (const id of behaviorIds) fetchOne(id);
  }, [conn, behaviorIds, fetchOne]);

  const applyConfig = useCallback(
    async (id: number, config: HoldTapConfig) => {
      if (!conn) return false;
      try {
        const resp = await call_rpc(conn, {
          behaviors: { setBehaviorConfig: { behaviorId: id, holdTap: config } },
        });
        const ok = resp.behaviors?.setBehaviorConfig === true;
        if (ok) setCache((prev) => ({ ...prev, [id]: config }));
        return ok;
      } catch {
        return false;
      }
    },
    [conn]
  );

  const getConfig = useCallback(
    (id: number): HoldTapConfig | null => cache[id] ?? null,
    [cache]
  );

  return { getConfig, applyConfig };
}
