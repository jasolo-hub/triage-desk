import { createContext } from "react";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

// Lives in its own file so index.tsx only exports a component — Vite fast
// refresh (and the react-refresh lint rule) needs component-only modules.
export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType
);
