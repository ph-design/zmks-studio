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

  useEffect(() => {
    activeConnection.current = connection;
    inFlight.current = false;
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

  const edit = useCallback(async (change: RgbGeneralSettings) => {
    if (!connection || inFlight.current) return;
    inFlight.current = true;
    setPreviewing(true);
    setPreviewFailed(false);
    try {
      const ok = await send(change);
      if (activeConnection.current !== connection) return;
      if (!ok) {
        setPreviewFailed(true);
        return;
      }
      setRgbState((current) => current && { ...current, ...change });
      setPending(true);
    } finally {
      inFlight.current = false;
      if (activeConnection.current === connection) setPreviewing(false);
    }
  }, [connection, send, setRgbState]);

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
