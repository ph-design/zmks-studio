import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Request } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "../rpc/logging";
import {
  PhysicalLayout,
  Keymap,
  SetLayerBindingResponse,
  SetLayerPropsResponse,
  BehaviorBinding,
  Layer,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type {
  GetLayerLedColorsResponse,
  RgbUnderglowState,
  BacklightState,
  CapsLockIndicatorState,
  ConnectionIndicatorState,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";
import { produce } from "immer";

import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { deserializeLayoutZoom, LayoutZoom } from "../keyboard/PhysicalLayout";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { useSub } from "../usePubSub";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface IndicatorPositionDraft {
  keyPosition: number;
  layerId: number;
}

export interface KeyboardModelCallbacks {
  onReady?: (ready: boolean) => void;
  onProgress?: (value: number) => void;
  onLightingChanged?: () => void;
}

/*
 * All keyboard data + RPC orchestration, lifted verbatim from the original
 * `src/keyboard/Keyboard.tsx` so the Carbon shell's multiple views (layers /
 * keymap canvas / binding drawer / lighting / device info) share one source of
 * truth. No RPC behaviour changed — only relocated out of the presentation.
 */
function useBehaviors(): [BehaviorMap, boolean] {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [behaviors, setBehaviors] = useState<BehaviorMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setBehaviors({});
      setLoaded(false);
      return;
    }

    async function startRequest() {
      setBehaviors({});
      setLoaded(false);

      if (!connection.conn) {
        return;
      }

      let get_behaviors: Request = {
        behaviors: { listAllBehaviors: true },
        requestId: 0,
      };

      const behavior_map: BehaviorMap = {};
      try {
        const behavior_list = await call_rpc(connection.conn, get_behaviors);
        for (let behaviorId of behavior_list.behaviors?.listAllBehaviors
          ?.behaviors || []) {
          if (ignore) {
            break;
          }
          let details_req = {
            behaviors: { getBehaviorDetails: { behaviorId } },
            requestId: 0,
          };
          try {
            const behavior_details = await call_rpc(connection.conn, details_req);
            const dets: GetBehaviorDetailsResponse | undefined =
              behavior_details?.behaviors?.getBehaviorDetails;

            if (dets) {
              behavior_map[dets.id] = dets;
            }
          } catch (e) {
            console.error("Failed to load behavior", behaviorId, e);
          }
        }
      } catch (e) {
        console.error("Failed to list behaviors", e);
      }

      if (!ignore) {
        setBehaviors(behavior_map);
        setLoaded(true);
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return [behaviors, loaded];
}

function useLayouts(): [
  PhysicalLayout[] | undefined,
  React.Dispatch<SetStateAction<PhysicalLayout[] | undefined>>,
  number,
  React.Dispatch<SetStateAction<number>>
] {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [layouts, setLayouts] = useState<PhysicalLayout[] | undefined>(
    undefined
  );
  const [selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex] =
    useState<number>(0);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayouts(undefined);
      return;
    }

    async function startRequest() {
      setLayouts(undefined);

      if (!connection.conn) {
        return;
      }

      let response = await call_rpc(connection.conn, {
        keymap: { getPhysicalLayouts: true },
      });

      if (!ignore) {
        setLayouts(response?.keymap?.getPhysicalLayouts?.layouts);
        setSelectedPhysicalLayoutIndex(
          response?.keymap?.getPhysicalLayouts?.activeLayoutIndex || 0
        );
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return [
    layouts,
    setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ];
}

export function useKeyboardModel({
  onReady,
  onProgress,
  onLightingChanged,
}: KeyboardModelCallbacks) {
  const [
    layouts,
    _setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ] = useLayouts();

  const [keymap, setKeymap] = useConnectedDeviceData<Keymap>(
    { keymap: { getKeymap: true } },
    (keymap) => {
      console.log("Got the keymap!");
      return keymap?.keymap?.getKeymap;
    },
    true
  );

  const [keymapScale, setKeymapScale] = useLocalStorageState<LayoutZoom>(
    "keymapScale",
    "auto",
    { deserialize: deserializeLayoutZoom }
  );

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);
  const [behaviors, behaviorsLoaded] = useBehaviors();

  const [ledData, setLedData] = useState<GetLayerLedColorsResponse | null>(null);
  const [selectedLedPositions, setSelectedLedPositions] = useState<Set<number>>(
    new Set()
  );
  const [hasLayerLed, setHasLayerLed] = useState(false);

  const [rgbState, setRgbState] = useState<RgbUnderglowState | null>(null);
  const [backlightState, setBacklightState] = useState<BacklightState | null>(
    null
  );
  const [capsLockState, setCapsLockState] =
    useState<CapsLockIndicatorState | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionIndicatorState | null>(null);
  const [hasRgb, setHasRgb] = useState(false);
  const [hasBacklight, setHasBacklight] = useState(false);
  const [hasCapsLock, setHasCapsLock] = useState(false);
  const [hasConnection, setHasConnection] = useState(false);
  const [lightingLoaded, setLightingLoaded] = useState(false);
  const [indicatorPositionDraft, setIndicatorPositionDraft] = useState<
    IndicatorPositionDraft | undefined
  >(undefined);
  const [lightingSource, setLightingSource] = useState<string>("rgb");

  const handleIndicatorPick = useCallback(
    (positions: Set<number>) => {
      if (lightingSource !== "capslock" && lightingSource !== "connection") {
        return false;
      }

      const first = positions.values().next().value;
      if (first !== undefined) {
        setIndicatorPositionDraft({ keyPosition: first, layerId: 0 });
      }
      return true;
    },
    [lightingSource]
  );

  const handleLightingSourceChanged = useCallback((source: string) => {
    setLightingSource(source);
    setIndicatorPositionDraft(undefined);
    setSelectedLedPositions(new Set());
  }, []);

  const indicatorPositions = useMemo(() => {
    const set = new Set<number>();
    if (indicatorPositionDraft !== undefined) {
      set.add(indicatorPositionDraft.keyPosition);
    } else if (
      lightingSource === "capslock" &&
      capsLockState?.enabled &&
      capsLockState.keyPosition !== undefined
    ) {
      set.add(capsLockState.keyPosition);
    } else if (
      lightingSource === "connection" &&
      connectionState?.enabled &&
      connectionState.keyPosition !== undefined
    ) {
      set.add(connectionState.keyPosition);
    }
    return set;
  }, [
    lightingSource,
    capsLockState?.enabled,
    capsLockState?.keyPosition,
    connectionState?.enabled,
    connectionState?.keyPosition,
    indicatorPositionDraft,
  ]);

  const conn = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const undoRedo = useContext(UndoRedoContext);
  const isUnlocked =
    lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
    setSelectedLedPositions(new Set());
    setLedData(null);
    setHasLayerLed(false);
    setRgbState(null);
    setBacklightState(null);
    setCapsLockState(null);
    setConnectionState(null);
    setIndicatorPositionDraft(undefined);
    setHasRgb(false);
    setHasBacklight(false);
    setHasCapsLock(false);
    setHasConnection(false);
    setLightingLoaded(false);
  }, [conn]);

  const fetchAllLighting = useCallback(
    async (ignore?: { current: boolean }) => {
      if (!conn.conn) return;

      const [ledResp, rgbResp, blResp, capsResp, connResp] =
        await Promise.allSettled([
          call_rpc(conn.conn, { lighting: { getLayerLedColors: true } }),
          call_rpc(conn.conn, { lighting: { getRgbUnderglowState: true } }),
          call_rpc(conn.conn, { lighting: { getBacklightState: true } }),
          call_rpc(conn.conn, { lighting: { getCapsLockIndicator: true } }),
          call_rpc(conn.conn, { lighting: { getConnectionIndicator: true } }),
        ]);

      if (ignore?.current) return;

      if (
        ledResp.status === "fulfilled" &&
        ledResp.value.lighting?.getLayerLedColors
      ) {
        setLedData(ledResp.value.lighting.getLayerLedColors);
        setHasLayerLed(true);
      }
      if (
        rgbResp.status === "fulfilled" &&
        rgbResp.value.lighting?.getRgbUnderglowState
      ) {
        setRgbState(rgbResp.value.lighting.getRgbUnderglowState);
        setHasRgb(true);
      }
      if (
        blResp.status === "fulfilled" &&
        blResp.value.lighting?.getBacklightState
      ) {
        setBacklightState(blResp.value.lighting.getBacklightState);
        setHasBacklight(true);
      }
      if (
        capsResp.status === "fulfilled" &&
        capsResp.value.lighting?.getCapsLockIndicator
      ) {
        setCapsLockState(capsResp.value.lighting.getCapsLockIndicator);
        setHasCapsLock(true);
      }
      if (
        connResp.status === "fulfilled" &&
        connResp.value.lighting?.getConnectionIndicator
      ) {
        setConnectionState(connResp.value.lighting.getConnectionIndicator);
        setHasConnection(true);
      }
      setLightingLoaded(true);
    },
    [conn]
  );

  useEffect(() => {
    setLightingLoaded(false);

    if (!conn.conn || !isUnlocked) {
      return;
    }

    const ignore = { current: false };
    fetchAllLighting(ignore);
    return () => {
      ignore.current = true;
    };
  }, [conn, isUnlocked, fetchAllLighting]);

  useEffect(() => {
    if (!conn.conn || !isUnlocked) {
      onReady?.(false);
      onProgress?.(0);
      return;
    }

    const stages = [!!keymap, !!layouts, behaviorsLoaded, lightingLoaded];
    const loadedCount = stages.filter(Boolean).length;
    onProgress?.(loadedCount / stages.length);

    const ready = loadedCount === stages.length;
    onReady?.(ready);
  }, [
    behaviorsLoaded,
    conn.conn,
    isUnlocked,
    keymap,
    layouts,
    lightingLoaded,
    onReady,
    onProgress,
  ]);

  // Hot-update via notifications (always active)
  useSub(
    "rpc_notification.lighting.rgbUnderglowStateChanged",
    (state: RgbUnderglowState) => setRgbState(state)
  );
  useSub(
    "rpc_notification.lighting.backlightStateChanged",
    (state: BacklightState) => setBacklightState(state)
  );

  const handleLayerLedColorChanged = useCallback(
    async (positions: number[], color: number) => {
      if (!conn.conn || !keymap || !ledData) return;
      const layerIdx = selectedLayerIndex;
      const layerId = keymap.layers[layerIdx]?.id;
      if (layerId === undefined) return;

      setLedData(
        produce((draft) => {
          if (!draft) return;
          let layerConfig = draft.layers.find((l) => l.layerId === layerId);
          if (!layerConfig) {
            layerConfig = { layerId, bindings: [] };
            draft.layers.push(layerConfig);
          }
          for (const pos of positions) {
            const existing = layerConfig.bindings.find(
              (b) => b.keyPosition === pos
            );
            if (existing) {
              existing.color = color;
            } else {
              layerConfig.bindings.push({ keyPosition: pos, color });
            }
          }
        })
      );

      for (const pos of positions) {
        try {
          await call_rpc(conn.conn, {
            lighting: { setLayerLedBinding: { layerId, keyPosition: pos, color } },
          });
          onLightingChanged?.();
        } catch (e) {
          console.error("Failed to set layer LED binding", e);
        }
      }
    },
    [conn, keymap, ledData, onLightingChanged, selectedLayerIndex]
  );

  const handleLayerLedEnabledChanged = useCallback(
    async (enabled: boolean) => {
      if (!conn.conn) return;
      setLedData(
        produce((draft) => {
          if (draft) draft.enabled = enabled;
        })
      );
      try {
        const resp = await call_rpc(conn.conn, {
          lighting: { setLayerLedEnabled: { enabled } },
        });
        if (resp.lighting?.setLayerLedEnabled) {
          onLightingChanged?.();
        }
      } catch (e) {
        console.error("Failed to set layer LED enabled", e);
      }
    },
    [conn, onLightingChanged]
  );

  useEffect(() => {
    async function performSetRequest() {
      if (!conn.conn || !layouts) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { setActivePhysicalLayout: selectedPhysicalLayoutIndex },
      });

      let new_keymap = resp?.keymap?.setActivePhysicalLayout?.ok;
      if (new_keymap) {
        setKeymap(new_keymap);
      } else {
        console.error(
          "Failed to set the active physical layout err:",
          resp?.keymap?.setActivePhysicalLayout?.err
        );
      }
    }

    performSetRequest();
  }, [selectedPhysicalLayoutIndex]);

  const doSelectPhysicalLayout = useCallback(
    (i: number) => {
      let oldLayout = selectedPhysicalLayoutIndex;
      undoRedo?.(async () => {
        setSelectedPhysicalLayoutIndex(i);

        return async () => {
          setSelectedPhysicalLayoutIndex(oldLayout);
        };
      });
    },
    [undoRedo, selectedPhysicalLayoutIndex]
  );

  const doUpdateBinding = useCallback(
    (binding: BehaviorBinding) => {
      if (!keymap || selectedKeyPosition === undefined) {
        console.error(
          "Can't update binding without a selected key position and loaded keymap"
        );
        return;
      }

      const layer = selectedLayerIndex;
      const layerId = keymap.layers[layer].id;
      const keyPosition = selectedKeyPosition;
      const oldBinding = keymap.layers[layer].bindings[keyPosition];
      undoRedo?.(async () => {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { setLayerBinding: { layerId, keyPosition, binding } },
        });

        if (
          resp.keymap?.setLayerBinding ===
          SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              draft.layers[layer].bindings[keyPosition] = binding;
            })
          );
        } else {
          console.error("Failed to set binding", resp.keymap?.setLayerBinding);
        }

        return async () => {
          if (!conn.conn) {
            return;
          }

          let resp = await call_rpc(conn.conn, {
            keymap: {
              setLayerBinding: { layerId, keyPosition, binding: oldBinding },
            },
          });
          if (
            resp.keymap?.setLayerBinding ===
            SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
          ) {
            setKeymap(
              produce((draft: any) => {
                draft.layers[layer].bindings[keyPosition] = oldBinding;
              })
            );
          } else {
          }
        };
      });
    },
    [conn, keymap, undoRedo, selectedLayerIndex, selectedKeyPosition]
  );

  const selectedBinding = useMemo(() => {
    if (
      keymap == null ||
      selectedKeyPosition == null ||
      !keymap.layers[selectedLayerIndex]
    ) {
      return null;
    }

    return keymap.layers[selectedLayerIndex].bindings[selectedKeyPosition];
  }, [keymap, selectedLayerIndex, selectedKeyPosition]);

  const moveLayer = useCallback(
    (start: number, end: number) => {
      const doMove = async (startIndex: number, destIndex: number) => {
        if (!conn.conn) {
          return;
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { moveLayer: { startIndex, destIndex } },
        });

        if (resp.keymap?.moveLayer?.ok) {
          setKeymap(resp.keymap?.moveLayer?.ok);
          setSelectedLayerIndex(destIndex);
        } else {
          console.error("Error moving", resp);
        }
      };

      undoRedo?.(async () => {
        await doMove(start, end);
        return () => doMove(end, start);
      });
    },
    [undoRedo]
  );

  const addLayer = useCallback(() => {
    async function doAdd(): Promise<number> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });

      if (resp.keymap?.addLayer?.ok) {
        const newSelection = keymap.layers.length;
        setKeymap(
          produce((draft: any) => {
            draft.layers.push(resp.keymap!.addLayer!.ok!.layer);
            draft.availableLayers--;
          })
        );

        setSelectedLayerIndex(newSelection);

        return resp.keymap.addLayer.ok.index;
      } else {
        console.error("Add error", resp.keymap?.addLayer?.err);
        throw new Error("Failed to add layer:" + resp.keymap?.addLayer?.err);
      }
    }

    async function doRemove(layerIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      console.log(resp);
      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    undoRedo?.(async () => {
      let index = await doAdd();
      return () => doRemove(index);
    });
  }, [conn, undoRedo, keymap]);

  const removeLayer = useCallback(() => {
    async function doRemove(layerIndex: number): Promise<void> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        if (layerIndex == keymap.layers.length - 1) {
          setSelectedLayerIndex(layerIndex - 1);
        }
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    async function doRestore(layerId: number, atIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { restoreLayer: { layerId, atIndex } },
      });

      console.log(resp);
      if (resp.keymap?.restoreLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(atIndex, 0, resp!.keymap!.restoreLayer!.ok);
            draft.availableLayers--;
          })
        );
        setSelectedLayerIndex(atIndex);
      } else {
        console.error("Remove error", resp.keymap?.restoreLayer?.err);
        throw new Error(
          "Failed to restore layer:" + resp.keymap?.restoreLayer?.err
        );
      }
    }

    if (!keymap) {
      throw new Error("No keymap loaded");
    }

    let index = selectedLayerIndex;
    let layerId = keymap.layers[index].id;
    undoRedo?.(async () => {
      await doRemove(index);
      return () => doRestore(layerId, index);
    });
  }, [conn, undoRedo, selectedLayerIndex]);

  /*
   * "Duplicate layer" is not a ZMK Studio RPC primitive — it's composed here
   * from addLayer + a setLayerBinding per key position, using the exact same
   * calls the rest of this hook already makes. No protocol/backend change.
   */
  const duplicateLayer = useCallback(() => {
    if (!keymap) {
      throw new Error("No keymap loaded");
    }
    const sourceIndex = selectedLayerIndex;
    const sourceLayer = keymap.layers[sourceIndex];
    const sourceBindings = sourceLayer.bindings.slice();
    const newName = `${sourceLayer.name || `Layer ${sourceIndex}`} copy`;

    async function doDuplicate(): Promise<number> {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const addResp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });
      if (!addResp.keymap?.addLayer?.ok) {
        throw new Error(
          "Failed to add layer:" + addResp.keymap?.addLayer?.err
        );
      }
      const { index: newIndex, layer: newLayer } = addResp.keymap.addLayer.ok;
      if (!newLayer) {
        throw new Error("Add layer returned no layer");
      }

      await call_rpc(conn.conn, {
        keymap: { setLayerProps: { layerId: newLayer.id, name: newName } },
      });

      for (let pos = 0; pos < sourceBindings.length; pos++) {
        await call_rpc(conn.conn, {
          keymap: {
            setLayerBinding: {
              layerId: newLayer.id,
              keyPosition: pos,
              binding: sourceBindings[pos],
            },
          },
        });
      }

      setKeymap(
        produce((draft: any) => {
          draft.layers.push({
            ...newLayer,
            name: newName,
            bindings: sourceBindings.map((b) => ({ ...b })),
          });
          draft.availableLayers--;
        })
      );
      setSelectedLayerIndex(newIndex);
      return newIndex;
    }

    async function undoDuplicate(index: number) {
      if (!conn.conn) return;
      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex: index } },
      });
      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(index, 1);
            draft.availableLayers++;
          })
        );
      }
    }

    undoRedo?.(async () => {
      const index = await doDuplicate();
      return () => undoDuplicate(index);
    });
  }, [conn, keymap, undoRedo, selectedLayerIndex]);

  const changeLayerName = useCallback(
    (id: number, oldName: string, newName: string) => {
      async function changeName(layerId: number, name: string) {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerProps: { layerId, name } },
        });

        if (
          resp.keymap?.setLayerProps ==
          SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              const layer_index = draft.layers.findIndex(
                (l: Layer) => l.id == layerId
              );
              draft.layers[layer_index].name = name;
            })
          );
        } else {
          throw new Error(
            "Failed to change layer name:" + resp.keymap?.setLayerProps
          );
        }
      }

      undoRedo?.(async () => {
        await changeName(id, newName);
        return async () => {
          await changeName(id, oldName);
        };
      });
    },
    [conn, undoRedo, keymap]
  );

  useEffect(() => {
    if (!keymap?.layers) return;

    const layers = keymap.layers.length - 1;

    if (selectedLayerIndex > layers) {
      setSelectedLayerIndex(layers);
    }
  }, [keymap, selectedLayerIndex]);

  const dataReady = !!(layouts && keymap && behaviorsLoaded);
  const behaviorList = useMemo(() => Object.values(behaviors), [behaviors]);

  return {
    // connection / lock
    conn,
    isUnlocked,
    dataReady,
    // keymap + layouts
    keymap,
    setKeymap,
    layouts,
    selectedPhysicalLayoutIndex,
    doSelectPhysicalLayout,
    // behaviors
    behaviors,
    behaviorsLoaded,
    behaviorList,
    // selection
    selectedLayerIndex,
    setSelectedLayerIndex,
    selectedKeyPosition,
    setSelectedKeyPosition,
    selectedBinding,
    // keymap mutations
    doUpdateBinding,
    moveLayer,
    addLayer,
    removeLayer,
    duplicateLayer,
    changeLayerName,
    // zoom
    keymapScale,
    setKeymapScale,
    // lighting
    ledData,
    hasLayerLed,
    selectedLedPositions,
    setSelectedLedPositions,
    rgbState,
    setRgbState,
    backlightState,
    setBacklightState,
    capsLockState,
    setCapsLockState,
    connectionState,
    setConnectionState,
    hasRgb,
    hasBacklight,
    hasCapsLock,
    hasConnection,
    lightingSource,
    handleLightingSourceChanged,
    indicatorPositionDraft,
    setIndicatorPositionDraft,
    indicatorPositions,
    handleIndicatorPick,
    handleLayerLedColorChanged,
    handleLayerLedEnabledChanged,
    fetchAllLighting,
    // pass-through so LightingControl's own RPC writes can mark lighting dirty
    onLightingChanged,
  };
}

export type KeyboardModel = ReturnType<typeof useKeyboardModel>;
