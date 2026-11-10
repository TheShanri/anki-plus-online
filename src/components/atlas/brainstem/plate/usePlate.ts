"use client";
import { useEffect, useSyncExternalStore } from "react";
import { cachedPlate, loadPlate, subscribePlates } from "./load";
import type { PlateData } from "./types";

/** The level's plate (null while loading, "missing" when it cannot be loaded). */
export function usePlate(level: string | null): PlateData | "missing" | null {
  const plate = useSyncExternalStore(
    subscribePlates,
    () => (level ? cachedPlate(level) : null),
    () => null,
  );
  useEffect(() => {
    if (level) void loadPlate(level);
  }, [level]);
  return plate;
}
