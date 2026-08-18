export type EntryRoarTelemetry = {
  variant: string;
  count: number;
  pan: number;
  reverb: boolean;
};

export function createEntryRoarTelemetry(variant: string, count: number, pan: number, reverb: boolean): EntryRoarTelemetry {
  return {
    variant,
    count,
    pan: Math.max(-1, Math.min(1, pan)),
    reverb,
  };
}

export function entryPanForSide(side: "left" | "center" | "right") {
  if (side === "left") return -1;
  if (side === "right") return 1;
  return 0;
}
