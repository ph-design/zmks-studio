import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
} from "@zmkfirmware/zmk-studio-ts-client/lighting";

import { LayerPicker } from "./LayerPicker";
import { PhysicalLayoutPicker } from "./PhysicalLayoutPicker";
import { Keymap as KeymapComp } from "./Keymap";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { produce } from "immer";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { deserializeLayoutZoom, LayoutZoom } from "./PhysicalLayout";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { useTranslation } from "react-i18next";
import IdlePanel from "./IdlePanel";
import LightingControl from "../lighting/LightingControl";
import LayerLedMap from "../lighting/LayerLedMap";
import { useSub } from "../usePubSub";
import type { ConnectionProgress } from "../ConnectModal";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

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

      let behavior_list = await call_rpc(connection.conn, get_behaviors);
      if (!ignore) {
        let behavior_map: BehaviorMap = {};
        for (let behaviorId of behavior_list.behaviors?.listAllBehaviors
          ?.behaviors || []) {
          if (ignore) {
            break;
          }
          let details_req = {
            behaviors: { getBehaviorDetails: { behaviorId } },
            requestId: 0,
          };
          let behavior_details = await call_rpc(connection.conn, details_req);
          let dets: GetBehaviorDetailsResponse | undefined =
            behavior_details?.behaviors?.getBehaviorDetails;

          if (dets) {
            behavior_map[dets.id] = dets;
          }
        }

        if (!ignore) {
          setBehaviors(behavior_map);
          setLoaded(true);
        }
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

export interface KeyboardProps {
  onStartupProgress?: (progress: ConnectionProgress) => void;
  onReady?: (ready: boolean) => void;
}

export default function Keyboard({ onStartupProgress, onReady }: KeyboardProps) {
  const [
    layouts,
    _setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ] = useLayouts();
  const { t } = useTranslation();
  const [keymap, setKeymap] = useConnectedDeviceData<Keymap>(
    { keymap: { getKeymap: true } },
    (keymap) => {
      console.log("Got the keymap!");
      return keymap?.keymap?.getKeymap;
    },
    true
  );

  const [keymapScale, setKeymapScale] = useLocalStorageState<LayoutZoom>("keymapScale", "auto", {
    deserialize: deserializeLayoutZoom,
  });

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);
  const [bottomTab, setBottomTab] = useState<"keymap" | "lighting">("keymap");
  const [behaviors, behaviorsLoaded] = useBehaviors();

  const [ledData, setLedData] = useState<GetLayerLedColorsResponse | null>(null);
  const [selectedLedPositions, setSelectedLedPositions] = useState<Set<number>>(new Set());
  const [hasLayerLed, setHasLayerLed] = useState(false);

  const [rgbState, setRgbState] = useState<RgbUnderglowState | null>(null);
  const [backlightState, setBacklightState] = useState<BacklightState | null>(null);
  const [capsLockState, setCapsLockState] = useState<CapsLockIndicatorState | null>(null);
  const [hasRgb, setHasRgb] = useState(false);
  const [hasBacklight, setHasBacklight] = useState(false);
  const [hasCapsLock, setHasCapsLock] = useState(false);
  const [lightingLoaded, setLightingLoaded] = useState(false);

  const conn = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const undoRedo = useContext(UndoRedoContext);
  const isUnlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
    setSelectedLedPositions(new Set());
    setLedData(null);
    setHasLayerLed(false);
    setRgbState(null);
    setBacklightState(null);
    setCapsLockState(null);
    setHasRgb(false);
    setHasBacklight(false);
    setHasCapsLock(false);
    setLightingLoaded(false);
  }, [conn]);

  const fetchAllLighting = useCallback(async (ignore?: { current: boolean }) => {
    if (!conn.conn) return;

    const [ledResp, rgbResp, blResp, capsResp] = await Promise.allSettled([
      call_rpc(conn.conn, { lighting: { getLayerLedColors: true } }),
      call_rpc(conn.conn, { lighting: { getRgbUnderglowState: true } }),
      call_rpc(conn.conn, { lighting: { getBacklightState: true } }),
      call_rpc(conn.conn, { lighting: { getCapsLockIndicator: true } }),
    ]);

    if (ignore?.current) return;

    if (ledResp.status === "fulfilled" && ledResp.value.lighting?.getLayerLedColors) {
      setLedData(ledResp.value.lighting.getLayerLedColors);
      setHasLayerLed(true);
    }
    if (rgbResp.status === "fulfilled" && rgbResp.value.lighting?.getRgbUnderglowState) {
      setRgbState(rgbResp.value.lighting.getRgbUnderglowState);
      setHasRgb(true);
    }
    if (blResp.status === "fulfilled" && blResp.value.lighting?.getBacklightState) {
      setBacklightState(blResp.value.lighting.getBacklightState);
      setHasBacklight(true);
    }
    if (capsResp.status === "fulfilled" && capsResp.value.lighting?.getCapsLockIndicator) {
      setCapsLockState(capsResp.value.lighting.getCapsLockIndicator);
      setHasCapsLock(true);
    }
    setLightingLoaded(true);
  }, [conn]);

  useEffect(() => {
    setLightingLoaded(false);

    if (!conn.conn || !isUnlocked) {
      return;
    }

    const ignore = { current: false };
    fetchAllLighting(ignore);
    return () => { ignore.current = true; };
  }, [conn, isUnlocked, fetchAllLighting]);

  useEffect(() => {
    if (!conn.conn || !isUnlocked) {
      onReady?.(false);
      return;
    }

    let progress: ConnectionProgress = {
      labelKey: "welcome.connectProgressInitStart",
      percent: 62,
    };

    if (keymap) {
      progress = { labelKey: "welcome.connectProgressKeymap", percent: 72 };
    }

    if (layouts) {
      progress = { labelKey: "welcome.connectProgressLayouts", percent: 80 };
    }

    if (behaviorsLoaded) {
      progress = { labelKey: "welcome.connectProgressBehaviors", percent: 90 };
    }

    if (lightingLoaded) {
      progress = { labelKey: "welcome.connectProgressLighting", percent: 96 };
    }

    const ready = !!keymap && !!layouts && behaviorsLoaded && lightingLoaded;
    if (ready) {
      progress = { labelKey: "welcome.connectProgressReady", percent: 100 };
    }

    onStartupProgress?.(progress);
    onReady?.(ready);
  }, [behaviorsLoaded, conn.conn, isUnlocked, keymap, layouts, lightingLoaded, onReady, onStartupProgress]);

  // Re-fetch when user opens the lighting tab
  useEffect(() => {
    if (!conn.conn || !isUnlocked || bottomTab !== "lighting") {
      return;
    }
    const ignore = { current: false };
    fetchAllLighting(ignore);
    return () => { ignore.current = true; };
  }, [bottomTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hot-update via notifications (always active, not just on lighting tab)
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

      setLedData(produce((draft) => {
        if (!draft) return;
        let layerConfig = draft.layers.find((l) => l.layerId === layerId);
        if (!layerConfig) {
          layerConfig = { layerId, bindings: [] };
          draft.layers.push(layerConfig);
        }
        for (const pos of positions) {
          const existing = layerConfig.bindings.find((b) => b.keyPosition === pos);
          if (existing) {
            existing.color = color;
          } else {
            layerConfig.bindings.push({ keyPosition: pos, color });
          }
        }
      }));

      for (const pos of positions) {
        try {
          await call_rpc(conn.conn, {
            lighting: { setLayerLedBinding: { layerId, keyPosition: pos, color } },
          });
        } catch (e) {
          console.error("Failed to set layer LED binding", e);
        }
      }
    },
    [conn, keymap, ledData, selectedLayerIndex]
  );

  const handleLayerLedEnabledChanged = useCallback(
    async (enabled: boolean) => {
      if (!conn.conn) return;
      setLedData(produce((draft) => {
        if (draft) draft.enabled = enabled;
      }));
      try {
        await call_rpc(conn.conn, {
          lighting: { setLayerLedEnabled: { enabled } },
        });
      } catch (e) {
        console.error("Failed to set layer LED enabled", e);
      }
    },
    [conn]
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

  let doSelectPhysicalLayout = useCallback(
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

  let doUpdateBinding = useCallback(
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

  let selectedBinding = useMemo(() => {
    if (keymap == null || selectedKeyPosition == null || !keymap.layers[selectedLayerIndex]) {
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

  return (
    <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_minmax(10em,auto)] bg-base-300 max-w-full min-w-0 min-h-0">
      <div className="p-2 flex flex-col gap-2 bg-base-200 row-span-2">
        {layouts && (
          <div className="col-start-3 row-start-1 row-end-2">
            <PhysicalLayoutPicker
              layouts={layouts}
              selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
              onPhysicalLayoutClicked={doSelectPhysicalLayout}
            />
          </div>
        )}

        {keymap && (
          <div className="col-start-1 row-start-1 row-end-2">
            <LayerPicker
              layers={keymap.layers}
              selectedLayerIndex={selectedLayerIndex}
              onLayerClicked={setSelectedLayerIndex}
              onLayerMoved={moveLayer}
              canAdd={(keymap.availableLayers || 0) > 0}
              canRemove={(keymap.layers?.length || 0) > 1}
              onAddClicked={addLayer}
              onRemoveClicked={removeLayer}
              onLayerNameChanged={changeLayerName}
            />
          </div>
        )}
      </div>
      {layouts && keymap && behaviors && (
        <div className="p-2 col-start-2 row-start-1 grid items-center justify-center relative min-w-0">
          {bottomTab === "lighting" ? (
            <LayerLedMap
              keymap={keymap}
              layout={layouts[selectedPhysicalLayoutIndex]}
              scale={keymapScale}
              selectedLayerIndex={selectedLayerIndex}
              ledData={ledData}
              selectedPositions={selectedLedPositions}
              onSelectionChanged={setSelectedLedPositions}
            />
          ) : (
            <KeymapComp
              keymap={keymap}
              layout={layouts[selectedPhysicalLayoutIndex]}
              behaviors={behaviors}
              scale={keymapScale}
              selectedLayerIndex={selectedLayerIndex}
              selectedKeyPosition={selectedKeyPosition}
              onKeyPositionClicked={setSelectedKeyPosition}
            />
          )}
          <select
            className="absolute top-2 right-2 h-8 rounded px-2"
            value={keymapScale}
            onChange={(e) => {
              const value = deserializeLayoutZoom(e.target.value);
              setKeymapScale(value);
            }}
          >
            <option value="auto">{t("keyboard.zoom.auto")}</option>
            <option value={0.25}>25%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </div>
      )}
      {layouts && keymap && (
        <BottomPanel bottomTab={bottomTab} setBottomTab={setBottomTab} t={t}>
            {bottomTab === "keymap" ? (
              selectedBinding ? (
                <BehaviorBindingPicker
                  binding={selectedBinding}
                  behaviors={Object.values(behaviors)}
                  layers={keymap.layers.map(({ id, name }, li) => ({
                    id,
                    name: name || li.toLocaleString(),
                  }))}
                  onBindingChanged={doUpdateBinding}
                />
              ) : (
                <IdlePanel />
              )
            ) : (
              <LightingControl
                hasLayerLed={hasLayerLed}
                selectedLedPositions={selectedLedPositions}
                ledData={ledData}
                selectedLayerIndex={selectedLayerIndex}
                keymap={keymap}
                onLayerLedColorChanged={handleLayerLedColorChanged}
                layerLedEnabled={ledData?.enabled ?? true}
                onLayerLedEnabledChanged={handleLayerLedEnabledChanged}
                rgbState={rgbState}
                setRgbState={setRgbState}
                backlightState={backlightState}
                setBacklightState={setBacklightState}
                capsLockState={capsLockState}
                setCapsLockState={setCapsLockState}
                hasRgb={hasRgb}
                hasBacklight={hasBacklight}
                hasCapsLock={hasCapsLock}
              />
            )}
        </BottomPanel>
      )}
    </div>
  );
}

function BottomPanel({
  bottomTab,
  setBottomTab,
  t,
  children,
}: {
  bottomTab: string;
  setBottomTab: (tab: "keymap" | "lighting") => void;
  t: (key: string) => string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      setHeight(el.scrollHeight);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bottomTab]);

  return (
    <div className="col-start-2 row-start-2 bg-base-200 flex flex-col">
      <div className="flex shrink-0">
        <button
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            bottomTab === "keymap"
              ? "text-primary border-b-2 border-primary"
              : "text-base-content/50 hover:text-base-content/70"
          }`}
          onClick={() => setBottomTab("keymap")}
        >
          {t("keyboard.tab.keymap")}
        </button>
        <button
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            bottomTab === "lighting"
              ? "text-primary border-b-2 border-primary"
              : "text-base-content/50 hover:text-base-content/70"
          }`}
          onClick={() => setBottomTab("lighting")}
        >
          {t("keyboard.tab.lighting")}
        </button>
      </div>
      <div
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: height != null ? `${height}px` : "auto", minHeight: "15rem" }}
      >
        <div ref={contentRef} className="p-4">
          <div key={bottomTab} className="animate-fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
