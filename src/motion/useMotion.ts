import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { useSub } from "../usePubSub";

import {
  getMotionBackend,
  Orientation,
  type CarryConfig,
  type MotionBackend,
  type MotionCapabilities,
  type MotionLiveState,
  type StillWakeConfig,
  type TapConfig,
} from "./motionRpc";

const IDLE_LIVE_STATE: MotionLiveState = {
  magnitude: 0,
  orientation: Orientation.ORIENTATION_UNKNOWN,
  carryActive: false,
  tapDetected: false,
  lastClickSrc: 0,
};

export interface UseMotionOptions {
  /** Marks the session dirty so the header's Save button covers motion state. */
  onMotionChanged?: () => void;
}

// Probes once per connection; `hasMotion` gates the nav entry, matching how
// the lighting sources are gated.
export function useMotion({ onMotionChanged }: UseMotionOptions = {}) {
  const { conn } = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const unlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [capabilities, setCapabilities] = useState<MotionCapabilities | null>(null);
  const [tapConfig, setTapConfig] = useState<TapConfig | null>(null);
  const [carryConfig, setCarryConfig] = useState<CarryConfig | null>(null);
  const [stillWakeConfig, setStillWakeConfig] = useState<StillWakeConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [live, setLive] = useState<MotionLiveState>(IDLE_LIVE_STATE);

  const backend = useMemo<MotionBackend | null>(() => getMotionBackend(conn), [conn]);
  const generation = useRef(0);
  // Last config each setter confirmed; failed applies roll back here instead
  // of a closure snapshot, so in-flight applies can't clobber each other.
  const lastGood = useRef<{ tap: TapConfig | null; carry: CarryConfig | null; stillWake: StillWakeConfig | null }>({
    tap: null,
    carry: null,
    stillWake: null,
  });

  useEffect(() => {
    generation.current++;
    const gen = generation.current;

    setCapabilities(null);
    setTapConfig(null);
    setCarryConfig(null);
    setStillWakeConfig(null);
    setLive(IDLE_LIVE_STATE);
    setLoaded(false);
    setPendingWrites(0);

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

      const [tap, carry, stillWake] = await Promise.all([
        caps.supportsTap && caps.tapVersion === 2 ? backend.getTapConfig().catch(() => null) : Promise.resolve(null),
        caps.supportsCarry ? backend.getCarryConfig().catch(() => null) : Promise.resolve(null),
        caps.supportsStillWake && caps.guardVersion !== 1 ? backend.getStillWakeConfig().catch(() => null) : Promise.resolve(null),
      ]);
      if (generation.current !== gen) return;

      setCapabilities(caps);
      setTapConfig(tap);
      setCarryConfig(carry);
      setStillWakeConfig(stillWake);
      lastGood.current = { tap, carry, stillWake };
      setLoaded(true);
    })();
  }, [backend, unlocked]);

  // Both the RPC notification and the demo callback land in the same state.
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

  const apply = useCallback(
    async <T,>(
      config: T,
      send: (config: T) => Promise<boolean>,
      set: (config: T | null) => void,
      onGood: (config: T) => void,
      rollback: () => void
    ): Promise<boolean> => {
      if (!backend) return false;
      const gen = generation.current;
      set(config);
      setPendingWrites((count) => count + 1);
      try {
        const ok = await send(config).catch(() => false);
        if (gen !== generation.current) return false;
        if (ok) {
          onGood(config);
          onMotionChanged?.();
        } else {
          rollback();
        }
        return ok;
      } finally {
        if (gen === generation.current) setPendingWrites((count) => count - 1);
      }
    },
    [backend, onMotionChanged]
  );

  const applyTapConfig = useCallback(
    (config: TapConfig) =>
      apply(
        config,
        (c) => backend?.setTapConfig(c) ?? Promise.resolve(false),
        setTapConfig,
        (c) => (lastGood.current.tap = c),
        () => setTapConfig(lastGood.current.tap)
      ),
    [apply, backend]
  );

  const applyCarryConfig = useCallback(
    (config: CarryConfig) =>
      apply(
        config,
        (c) => backend?.setCarryConfig(c) ?? Promise.resolve(false),
        setCarryConfig,
        (c) => (lastGood.current.carry = c),
        () => setCarryConfig(lastGood.current.carry)
      ),
    [apply, backend]
  );

  const applyStillWakeConfig = useCallback(
    (config: StillWakeConfig) =>
      apply(
        config,
        (c) => backend?.setStillWakeConfig(c) ?? Promise.resolve(false),
        setStillWakeConfig,
        (c) => (lastGood.current.stillWake = c),
        () => setStillWakeConfig(lastGood.current.stillWake)
      ),
    [apply, backend]
  );

  return {
    hasMotion: !!capabilities,
    loaded,
    applying: pendingWrites > 0,
    capabilities,
    tapConfig,
    carryConfig,
    stillWakeConfig,
    applyTapConfig,
    applyCarryConfig,
    applyStillWakeConfig,
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
