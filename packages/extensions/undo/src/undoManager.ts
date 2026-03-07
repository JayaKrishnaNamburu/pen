import type {
  CRDTUndoManager,
  UndoManager,
  OpOrigin,
  Unsubscribe,
} from "@pen/types";

export class UndoManagerImpl implements UndoManager {
  private readonly _crdtUndo: CRDTUndoManager;
  private readonly _listeners = new Set<() => void>();
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _groupTimeout = 1000;

  constructor(crdtUndo: CRDTUndoManager) {
    this._crdtUndo = crdtUndo;
  }

  undo(): boolean {
    this._crdtUndo.stopCapturing();
    return this._crdtUndo.undo();
  }

  redo(): boolean {
    this._crdtUndo.stopCapturing();
    return this._crdtUndo.redo();
  }

  canUndo(): boolean {
    return this._crdtUndo.canUndo();
  }

  canRedo(): boolean {
    return this._crdtUndo.canRedo();
  }

  stopCapturing(): void {
    this._crdtUndo.stopCapturing();
    this._clearIdleTimer();
    this._notifyListeners();
  }

  setGroupTimeout(ms: number): void {
    this._groupTimeout = ms;
  }

  setTrackedOrigins(origins: OpOrigin[]): void {
    (
      this._crdtUndo as unknown as { trackedOrigins: Set<string> }
    ).trackedOrigins = new Set(origins);
  }

  onStackChange(callback: () => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  resetIdleTimer(): void {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      this._crdtUndo.stopCapturing();
      this._notifyListeners();
    }, this._groupTimeout);
  }

  _notifyListeners(): void {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  destroy(): void {
    this._clearIdleTimer();
    this._listeners.clear();
  }

  private _clearIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }
}
