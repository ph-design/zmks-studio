import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  RgbUnderglowState,
  SetRgbUnderglowStateRequest,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";

import { call_rpc } from "../rpc/logging";

export type RgbGeneralSettings = Pick<SetRgbUnderglowStateRequest, "fade" | "idle" | "layerWake">;

const fields = ["fade", "idle", "layerWake"] as const;

function changedSettings(rgb: RgbUnderglowState | null, draft: RgbGeneralSettings): RgbGeneralSettings {
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

export function useRgbGeneralDraft(
  connection: RpcConnection | null,
  rgb: RgbUnderglowState | null,
  setRgbState: Dispatch<SetStateAction<RgbUnderglowState | null>>
) {
  const [draft, setDraft] = useState<RgbGeneralSettings>({});
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewRequest = useRef<RpcConnection | null>(null);
  const activeConnection = useRef(connection);
  const pending = useMemo(() => changedSettings(rgb, draft), [rgb, draft]);

  useEffect(() => {
    activeConnection.current = connection;
    setDraft({});
    setPreviewing(false);
    setPreviewFailed(false);
    previewRequest.current = null;
    return () => {
      activeConnection.current = null;
    };
  }, [connection]);

  const edit = useCallback(async (change: RgbGeneralSettings) => {
    if (rgb?.generalChangesPending === undefined) {
      setDraft((previous) => changedSettings(rgb, { ...previous, ...change }));
      return;
    }
    if (!connection || previewRequest.current || Object.keys(changedSettings(rgb, change)).length === 0) {
      return;
    }

    previewRequest.current = connection;
    setPreviewing(true);
    setPreviewFailed(false);
    try {
      const response = await call_rpc(connection, {
        lighting: { setRgbUnderglowState: { ...change, preview: true } },
      });
      if (activeConnection.current !== connection) return;
      if (response?.lighting?.setRgbUnderglowState) {
        setRgbState((current) => current && { ...current, ...change, generalChangesPending: true });
      } else {
        setPreviewFailed(true);
      }
    } finally {
      if (previewRequest.current === connection) {
        previewRequest.current = null;
        setPreviewing(false);
      }
    }
  }, [connection, rgb, setRgbState]);

  const discard = useCallback(() => {
    setDraft({});
    setPreviewFailed(false);
  }, []);

  const markSaved = useCallback(() => {
    if (activeConnection.current === connection) {
      setRgbState((current) => current && { ...current, generalChangesPending: false });
    }
  }, [connection, setRgbState]);

  const save = useCallback(async () => {
    if (!connection) return false;

    let saved = true;
    for (const field of fields) {
      const value = pending[field];
      if (value === undefined) continue;
      if (activeConnection.current !== connection) return false;

      const patch: RgbGeneralSettings = { [field]: value };
      const response = await call_rpc(connection, { lighting: { setRgbUnderglowState: patch } });
      if (activeConnection.current !== connection) return false;
      if (!response?.lighting?.setRgbUnderglowState) {
        saved = false;
        continue;
      }

      setRgbState((current) => current && { ...current, ...patch });
      setDraft((current) => {
        if (current[field] !== value) return current;
        const remaining = { ...current };
        delete remaining[field];
        return remaining;
      });
    }
    return saved;
  }, [connection, pending, setRgbState]);

  return {
    settings: { fade: rgb?.fade, idle: rgb?.idle, layerWake: rgb?.layerWake, ...pending },
    hasChanges: rgb?.generalChangesPending === true || fields.some((field) => pending[field] !== undefined),
    hasPreviewChanges: rgb?.generalChangesPending === true,
    previewing,
    previewFailed,
    markSaved,
    edit,
    discard,
    save,
  };
}
