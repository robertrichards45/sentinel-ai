import { useEffect, useState } from 'react';
import { getGlasses, onGlasses, GlassesState } from './glassesState';
import { getSettings, onSettings, Settings } from './settings';
import { memory } from './memory';
import { MemoryState } from './memoryCore';

export function useGlasses(): GlassesState {
  const [g, setG] = useState(getGlasses());
  useEffect(() => { const off = onGlasses(setG); return () => { off(); }; }, []);
  return g;
}
export function useSettings(): Settings {
  const [s, setS] = useState(getSettings());
  useEffect(() => { const off = onSettings(setS); return () => { off(); }; }, []);
  return s;
}
export function useMemory(): MemoryState {
  const [m, setM] = useState(memory.get());
  useEffect(() => { const off = memory.on(setM); return () => { off(); }; }, []);
  return m;
}
