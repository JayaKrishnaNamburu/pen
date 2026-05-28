import type {
  CRDTUndoManager,
  UndoManager,
  OpOrigin,
  Unsubscribe,
} from "@pen/types";
import { getOpOriginType } from "@pen/types";

const EXPLICIT_GROUP_CAPTURE_TIMEOUT_MS = 2_147_483_647;

export class UndoManagerImpl implements UndoManager {
  private readonly _crdtUndo: CRDTUndoManager;
  private readonly _trackedOriginTypes = new Map<string, number>();
  private readonly _listeners = new Set<() => void>();
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _groupTimeout = 1000;
  private _baseCaptureTimeout = 1000;
  private _explicitUndoGroupId: string | null = null;
  _onCaptureBoundary: (() => void) | null = null;
  _isHistoryOperation = false;

  constructor(crdtUndo: CRDTUndoManager, trackedOrigins?: Iterable<OpOrigin>) {
    this._crdtUndo = crdtUndo;
    for (const origin of trackedOrigins ?? []) {
      this._trackedOriginTypes.set(getOpOriginType(origin), 1);
    }
  }

  undo(): boolean {
    this._explicitUndoGroupId = null;
    this._crdtUndo.setCaptureTimeout?.(this._baseCaptureTimeout);
    this._clearIdleTimer();
    this._stopCapturingWithBoundary();
    this._isHistoryOperation = true;
    try {
      return this._crdtUndo.undo();
    } finally {
      this._isHistoryOperation = false;
    }
  }

  redo(): boolean {
    this._explicitUndoGroupId = null;
    this._crdtUndo.setCaptureTimeout?.(this._baseCaptureTimeout);
    this._clearIdleTimer();
    this._stopCapturingWithBoundary();
    this._isHistoryOperation = true;
    try {
      return this._crdtUndo.redo();
    } finally {
      this._isHistoryOperation = false;
    }
  }

  canUndo(): boolean {
    return this._crdtUndo.canUndo();
  }

  canRedo(): boolean {
    return this._crdtUndo.canRedo();
  }

  stopCapturing(): void {
    this._explicitUndoGroupId = null;
    this._crdtUndo.setCaptureTimeout?.(this._baseCaptureTimeout);
    this._stopCapturingWithBoundary();
    this._clearIdleTimer();
    this._notifyListeners();
  }

  syncExplicitUndoGroup(groupId: string | null): void {
    if (this._explicitUndoGroupId === groupId) {
      if (groupId !== null) {
        this._clearIdleTimer();
      }
      return;
    }

    if (this._explicitUndoGroupId !== null || groupId !== null) {
      this._stopCapturingWithBoundary();
    }

    this._explicitUndoGroupId = groupId;
    this._crdtUndo.setCaptureTimeout?.(
      groupId === null
        ? this._baseCaptureTimeout
        : EXPLICIT_GROUP_CAPTURE_TIMEOUT_MS,
    );
    this._clearIdleTimer();
    this._notifyListeners();
  }

  setGroupTimeout(ms: number): void {
    this._groupTimeout = ms;
    this._baseCaptureTimeout = ms;
    if (this._explicitUndoGroupId === null) {
      this._crdtUndo.setCaptureTimeout?.(ms);
    }
  }

  registerTrackedOrigins(origins: OpOrigin[]): Unsubscribe {
    const registeredOrigins = new Set<OpOrigin>();
    let didDispose = false;
    for (const origin of origins) {
      if (registeredOrigins.has(origin)) {
        continue;
      }
      registeredOrigins.add(origin);
      this._incrementTrackedOrigin(origin);
    }
    return () => {
      if (didDispose) {
        return;
      }
      didDispose = true;
      for (const origin of registeredOrigins) {
        this._decrementTrackedOrigin(origin);
      }
    };
  }

  hasTrackedOrigin(origin: OpOrigin): boolean {
    return (this._trackedOriginTypes.get(getOpOriginType(origin)) ?? 0) > 0;
  }

  onStackChange(callback: () => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  resetIdleTimer(): void {
    if (this._explicitUndoGroupId !== null) {
      return;
    }
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      this._stopCapturingWithBoundary();
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
    this._crdtUndo.setCaptureTimeout?.(this._baseCaptureTimeout);
    this._explicitUndoGroupId = null;
    this._clearIdleTimer();
    this._listeners.clear();
  }

  private _incrementTrackedOrigin(origin: OpOrigin): void {
    const originType = getOpOriginType(origin);
    const count = this._trackedOriginTypes.get(originType) ?? 0;
    if (count === 0) {
      this._crdtUndo.addTrackedOrigin(originType);
    }
    this._trackedOriginTypes.set(originType, count + 1);
  }

  private _decrementTrackedOrigin(origin: OpOrigin): void {
    const originType = getOpOriginType(origin);
    const count = this._trackedOriginTypes.get(originType) ?? 0;
    if (count <= 1) {
      this._trackedOriginTypes.delete(originType);
      this._crdtUndo.removeTrackedOrigin(originType);
      return;
    }
    this._trackedOriginTypes.set(originType, count - 1);
  }

  private _clearIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  private _stopCapturingWithBoundary(): void {
    this._onCaptureBoundary?.();
    this._crdtUndo.stopCapturing();
  }
}
