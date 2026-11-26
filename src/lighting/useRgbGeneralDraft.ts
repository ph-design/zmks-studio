import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  RgbUnderglowState,
  SetRgbUnderglowStateRequest,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";

import { call_rpc } from "../rpc/logging";

export type RgbGeneralSettings = Pick<SetRgbUnderglowStateRequest, "fade" | "idle" | "layerWake">;

export function useRgbGeneralDraft(
  connection: RpcConnection | null,
  rgb: RgbUnderglowState | null,
  setRgbState: Dispatch<SetStateAction<RgbUnderglowState | null>>
) {
  // Edits stay in RAM until Save; generalChangesPending covers unsaved changes
  // left from an earlier session.
  const [pending, setPending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const activeConnection = useRef(connection);
  const inFlight = useRef(false);
  // Slider drags outrun the link; keep only the newest not-yet-sent change so
  // the device still ends on the value the user stopped on.
  const queued = useRef<RgbGeneralSettings | null>(null);

  useEffect(() => {
    activeConnection.current = connection;
    inFlight.current = false;
    queued.current = null;
    setPending(false);
    setPreviewing(false);
    setPreviewFailed(false);
    return () => {
      activeConnection.current = null;
    };
  }, [connection]);

  const send = useCallback(async (change: RgbGeneralSettings): Promise<boolean> => {
    if (!connection) return false;
    const response = await call_rpc(connection, {
      lighting: { setRgbUnderglowState: { ...change } },
    });
    if (activeConnection.current !== connection) return false;
    return !!response?.lighting?.setRgbUnderglowState;
  }, [connection]);

  const pump = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPreviewing(true);
    setPreviewFailed(false);
    try {
      while (queued.current) {
        const change = queued.current;
        queued.current = null;
        const ok = await send(change);
        if (activeConnection.current !== connection) return;
        if (!ok) {
          setPreviewFailed(true);
          return;
        }
        setRgbState((current) => current && { ...current, ...change });
        setPending(true);
      }
    } finally {
      inFlight.current = false;
      if (activeConnection.current === connection) setPreviewing(false);
    }
  }, [connection, send, setRgbState]);

  const edit = useCallback((change: RgbGeneralSettings) => {
    if (!connection) return;
    queued.current = { ...(queued.current ?? {}), ...change };
    void pump();
  }, [connection, pump]);

  const markSaved = useCallback(() => {
    if (activeConnection.current !== connection) return;
    setPending(false);
    setPreviewFailed(false);
    setRgbState((current) => current && { ...current, generalChangesPending: false });
  }, [connection, setRgbState]);

  // The firmware reverts RAM on discard; re-read it for the UI.
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!connection) return false;
    const response = await call_rpc(connection, {
      lighting: { getRgbUnderglowState: true },
    });
    if (activeConnection.current !== connection) return false;
    const state = response?.lighting?.getRgbUnderglowState;
    if (!state) return false;
    setRgbState(state);
    setPending(false);
    setPreviewFailed(false);
    return true;
  }, [connection, setRgbState]);

  return {
    settings: { fade: rgb?.fade, idle: rgb?.idle, layerWake: rgb?.layerWake },
    hasChanges: pending || !!rgb?.generalChangesPending,
    previewing,
    previewFailed,
    edit,
    markSaved,
    refresh,
  };
}
