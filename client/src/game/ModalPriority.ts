export type ArenaModal = "scene-error" | "graphics-recovery" | "result" | "pause";

export function activeArenaModal(input: Readonly<{
  sceneError: boolean;
  contextLost: boolean;
  hasResult: boolean;
  paused: boolean;
}>): ArenaModal | null {
  if (input.sceneError) return "scene-error";
  if (input.contextLost) return "graphics-recovery";
  if (input.hasResult) return "result";
  if (input.paused) return "pause";
  return null;
}
