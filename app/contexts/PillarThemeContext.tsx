"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type PillarThemeCtx = {
  activePillar: string | null;
  setActivePillar: (p: string | null) => void;
};

const PillarThemeContext = createContext<PillarThemeCtx>({
  activePillar: null,
  setActivePillar: () => {},
});

export function PillarThemeProvider({ children }: { children: ReactNode }) {
  const [activePillar, setActivePillar] = useState<string | null>(null);
  return (
    <PillarThemeContext.Provider value={{ activePillar, setActivePillar }}>
      {children}
    </PillarThemeContext.Provider>
  );
}

export function usePillarTheme() {
  return useContext(PillarThemeContext);
}
