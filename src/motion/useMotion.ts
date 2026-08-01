import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { useSub } from "../usePubSub";

import {
  getMotionBackend,
  Orientation,
  type LockConfig,
  type MotionBackend,
  type MotionCapabilities,
  type MotionLiveState,
  type TapConfig,
} from "./motionRpc";

const IDLE_LIVE_STATE: MotionLiveState = {
  magnitude: 0,
  orientation: Orientation.UNKNOWN,
  locked: false,
  tapDetected: false,
};

export interface UseMotionOptions {
  /** Marks the session dirty so the header's Save button covers motion state. */
  onMotionChanged?: () => void;
}

/*
 * Probes the motion subsystem once per connection and holds its config.
 * `hasMotion` is what gates the nav entry — a device without an IMU (or
 * firmware without the subsystem) fails the probe and the section never
 * appears, matching how the lighting sources are gated.
 */
export function useMotion({ onMotionChanged }: UseMotionOptions = {}) {
  const { conn } = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const unlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [capabilities, setCapabilities] = useState<MotionCapabilities | null>(null);
  const [tapConfig, setTapConfig] = useState<TapConfig | null>(null);
  const [lockConfig, setLockConfig] = useState<LockConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState<MotionLiveState>(IDLE_LIVE_STATE);

  const backend = useMemo<MotionBackend | null>(() => getMotionBackend(conn), [conn]);
  const generation = useRef(0);

  useEffect(() => {
    generation.current++;
    const gen = generation.current;

    setCapabilities(null);
    setTapConfig(null);
    setLockConfig(null);
    setLive(IDLE_LIVE_STATE);
    setLoaded(false);

    if (!backend || !unlocked) {
      // Nothing to probe — report "done, unsupported" so readiness isn't stuck.
      setLoaded(true);
      return;
    }

    (async () => {
      const caps = await backend.getCapabilities().catch(() => null);
      if (generation.current !== gen) return;
      if (!caps) {
        setLoaded(true);
        return;
      }

      const [tap, lock] = await Promise.all([
        caps.supportsTap ? backend.getTapConfig().catch(() => null) : Promise.resolve(null),
        caps.supportsLock ? backend.getLockConfig().catch(() => null) : Promise.resolve(null),
      ]);
      if (generation.current !== gen) return;

      setCapabilities(caps);
      setTapConfig(tap);
      setLockConfig(lock);
      setLoaded(true);
    })();
  }, [backend, unlocked]);

  // Real firmware pushes live state as a notification; the demo backend hands it
  // over directly. Both paths land in the same state.
  useSub("rpc_notification.motion.liveState", (state: MotionLiveState) => setLive(state));

  const [liveWanted, setLiveWanted] = useState(false);
  useEffect(() => {
    if (!backend || !capabilities || !liveWanted) return;

    let unsubscribe: (() => void) | undefined;
    backend.setLiveStream(true).catch(() => {});
    if (backend.subscribeLive) {
      unsubscribe = backend.subscribeLive(setLive);
    }

    return () => {
      unsubscribe?.();
      backend.setLiveStream(false).catch(() => {});
      setLive(IDLE_LIVE_STATE);
    };
  }, [backend, capabilities, liveWanted]);

  const applyTapConfig = useCallback(
    async (config: TapConfig): Promise<boolean> => {
      if (!backend) return false;
      const previous = tapConfig;
      setTapConfig(config);
      const ok = await backend.setTapConfig(config).catch(() => false);
      if (ok) {
        onMotionChanged?.();
      } else {
        setTapConfig(previous);
      }
      return ok;
    },
    [backend, onMotionChanged, tapConfig]
  );

  const applyLockConfig = useCallback(
    async (config: LockConfig): Promise<boolean> => {
      if (!backend) return false;
      const previous = lockConfig;
      setLockConfig(config);
      const ok = await backend.setLockConfig(config).catch(() => false);
      if (ok) {
        onMotionChanged?.();
      } else {
        setLockConfig(previous);
      }
      return ok;
    },
    [backend, onMotionChanged, lockConfig]
  );

  return {
    hasMotion: !!capabilities,
    loaded,
    capabilities,
    tapConfig,
    lockConfig,
    applyTapConfig,
    applyLockConfig,
    live,
    /** Live push costs airtime on BLE — only the motion view turns it on. */
    setLiveWanted,
  };
}

export type MotionModel = ReturnType<typeof useMotion>;

/** Saves motion state to flash; called from the app-wide save path. */
export async function saveMotionState(
  conn: Parameters<typeof getMotionBackend>[0]
): Promise<boolean> {
  const backend = getMotionBackend(conn);
  if (!backend) return true;
  return backend.saveState().catch(() => false);
}
