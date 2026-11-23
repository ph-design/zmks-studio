import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  RgbUnderglowState,
  SetRgbUnderglowStateRequest,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";

import { call_rpc } from "../rpc/logging";

export type RgbGeneralSettings = Pick<SetRgbUnderglowStateRequest, "fade" | "idle" | "layerWake">;

const fields = ["fade", "idle", "layerWake"] as const;

function diffFrom(rgb: RgbUnderglowState | null, draft: RgbGeneralSettings): RgbGeneralSettings {
  const changes: RgbGeneralSettings = {};
  if (rgb?.fade && draft.fade &&
      (rgb.fade.enabled !== draft.fade.enabled || rgb.fade.durationMs !== draft.fade.durationMs)) {
    changes.fade = draft.fade;
  }
  if (rgb?.idle && draft.idle &&
      (rgb.idle.sleepOnUsb !== draft.idle.sleepOnUsb || rgb.idle.timeoutMs !== draft.idle.timeoutMs)) {
    changes.idle = draft.idle;
  }
  if (rgb?.layerWake && draft.layerWake && rgb.layerWake.layers !== draft.layerWake.layers) {
    changes.layerWake = draft.layerWake;
  }
  return changes;
}

function pickSettings(state: RgbUnderglowState): RgbGeneralSettings {
  return { fade: state.fade, idle: state.idle, layerWake: state.layerWake };
}

export function useRgbGeneralDraft(
  connection: RpcConnection | null,
  rgb: RgbUnderglowState | null,
  setRgbState: Dispatch<SetStateAction<RgbUnderglowState | null>>
) {
  // Last values known to be persisted; the lighting RPC has no discard.
  const saved = useRef<RgbGeneralSettings | null>(null);
  const [pending, setPending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const activeConnection = useRef(connection);
  const inFlight = useRef(false);

  useEffect(() => {
    activeConnection.current = connection;
    saved.current = null;
    inFlight.current = false;
    setPending(false);
    setPreviewing(false);
    setPreviewFailed(false);
    return () => {
      activeConnection.current = null;
    };
  }, [connection]);

  useEffect(() => {
    if (rgb && !saved.current) saved.current = pickSettings(rgb);
  }, [rgb]);

  const sendPreview = useCallback(async (change: RgbGeneralSettings): Promise<boolean> => {
    if (!connection) return false;
    const response = await call_rpc(connection, {
      lighting: { setRgbUnderglowState: { ...change, preview: true } },
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
      const ok = await sendPreview(change);
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
  }, [connection, sendPreview, setRgbState]);

  const discard = useCallback(async (): Promise<boolean> => {
    const snapshot = saved.current;
    if (!connection || !snapshot) {
      setPending(false);
      setPreviewFailed(false);
      return true;
    }

    const restore = diffFrom(rgb, snapshot);
    let restored = true;
    for (const field of fields) {
      const value = restore[field];
      if (value === undefined) continue;
      if (activeConnection.current !== connection) return false;

      // Deliberately not a preview: this writes the persisted values back.
      const response = await call_rpc(connection, {
        lighting: { setRgbUnderglowState: { [field]: value } },
      });
      if (activeConnection.current !== connection) return false;
      if (!response?.lighting?.setRgbUnderglowState) {
        restored = false;
        continue;
      }

      const patch: RgbGeneralSettings = { [field]: value };
      setRgbState((current) => current && { ...current, ...patch });
    }

    if (restored) setPending(false);
    setPreviewFailed(false);
    return restored;
  }, [connection, rgb, setRgbState]);

  const markSaved = useCallback(() => {
    if (activeConnection.current !== connection) return;
    if (rgb) saved.current = pickSettings(rgb);
    setPending(false);
    setPreviewFailed(false);
  }, [connection, rgb]);

  return {
    settings: { fade: rgb?.fade, idle: rgb?.idle, layerWake: rgb?.layerWake },
    hasChanges: pending,
    previewing,
    previewFailed,
    edit,
    discard,
    markSaved,
  };
}
