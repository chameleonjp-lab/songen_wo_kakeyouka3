export type TouchLookPoint = { id: number; x: number; y: number };
export type TouchLookDelta = { dx: number; dy: number };

export class TouchLookController {
  private active: TouchLookPoint | null = null;

  pointerDown(point: TouchLookPoint) {
    this.active = point;
  }

  pointerMove(point: TouchLookPoint): TouchLookDelta | null {
    if (!this.active || this.active.id !== point.id) return null;
    const delta = { dx: point.x - this.active.x, dy: point.y - this.active.y };
    this.active = point;
    return delta;
  }

  pointerUp(id: number) {
    if (this.active?.id === id) this.active = null;
  }

  pointerCancel(id: number) {
    this.pointerUp(id);
  }

  isActive() {
    return this.active !== null;
  }
}
