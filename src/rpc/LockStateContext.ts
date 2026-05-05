import { createContext } from "react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

export const LockStateContext = createContext<LockState | undefined>(undefined);
