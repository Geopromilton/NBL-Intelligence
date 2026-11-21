import React, { createContext, useContext } from "react";

export interface AppCtx {
  site: string;
  siteInfo: any;
  health: any;
  go: (page: string) => void;
  ask: (q: string) => void;
  pendingQuestion: string | null;
  clearPending: () => void;
  toast: (t: string) => void;
  refreshHealth: () => void;
  update?: any;
  setUpdate?: (u: any) => void;
}
export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);
