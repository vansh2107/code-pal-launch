import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  PaletteId,
  PALETTES,
  ThemeMode,
} from "@/lib/themePalettes";

interface ThemePreferenceCtx {
  palette: PaletteId;
  mode: ThemeMode;
  setPalette: (p: PaletteId) => void;
  setMode: (m: ThemeMode) => void;
  /** Apply a preview without persisting; pass null to revert. */
  previewPalette: (p: PaletteId | null) => void;
}

const Ctx = createContext<ThemePreferenceCtx | null>(null);
const STORAGE_KEY = "remonk.theme.palette";

function readLocalPalette(): PaletteId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && PALETTES.some((p) => p.id === raw)) return raw as PaletteId;
  } catch {
    /* ignore */
  }
  return DEFAULT_PALETTE;
}

function applyPalette(palette: PaletteId) {
  const root = document.documentElement;
  if (palette === "vermilion") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", palette);
}

function flashTransition() {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), 320);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { theme: nextMode, setTheme: setNextMode } = useNextTheme();
  const [palette, setPaletteState] = useState<PaletteId>(() => {
    const p = readLocalPalette();
    if (typeof document !== "undefined") applyPalette(p);
    return p;
  });
  const previewRef = useRef<PaletteId | null>(null);
  const hydratedRef = useRef(false);

  const mode: ThemeMode =
    nextMode === "light" || nextMode === "dark" ? nextMode : DEFAULT_MODE;

  useEffect(() => {
    applyPalette(previewRef.current ?? palette);
  }, [palette]);

  // Hydrate from profile once
  useEffect(() => {
    if (!user || hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("user_id", user.id)
        .maybeSingle();
      const pref = ((data as any)?.theme_preference ?? null) as
        | { mode?: ThemeMode; theme?: PaletteId }
        | null;
      if (!pref) return;
      const nextPalette =
        (PALETTES.find((p) => p.id === pref.theme)?.id as PaletteId) ?? DEFAULT_PALETTE;
      const nextModeVal = (
        ["light", "dark", "system"].includes(pref.mode || "") ? pref.mode : DEFAULT_MODE
      ) as ThemeMode;
      setPaletteState(nextPalette);
      localStorage.setItem(STORAGE_KEY, nextPalette);
      setNextMode(nextModeVal);
    })();
  }, [user, setNextMode]);

  const persist = useCallback(
    async (next: { palette: PaletteId; mode: ThemeMode }) => {
      localStorage.setItem(STORAGE_KEY, next.palette);
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ theme_preference: { theme: next.palette, mode: next.mode } } as any)
        .eq("user_id", user.id);
    },
    [user]
  );

  const setPalette = useCallback(
    (p: PaletteId) => {
      previewRef.current = null;
      flashTransition();
      setPaletteState(p);
      persist({ palette: p, mode });
    },
    [mode, persist]
  );

  const setMode = useCallback(
    (m: ThemeMode) => {
      flashTransition();
      setNextMode(m);
      persist({ palette, mode: m });
    },
    [palette, persist, setNextMode]
  );

  const previewPalette = useCallback(
    (p: PaletteId | null) => {
      previewRef.current = p;
      flashTransition();
      applyPalette(p ?? palette);
    },
    [palette]
  );

  return (
    <Ctx.Provider value={{ palette, mode, setPalette, setMode, previewPalette }}>
      {children}
    </Ctx.Provider>
  );
}

export function useThemePreference() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useThemePreference must be used inside ThemePreferenceProvider");
  return ctx;
}
