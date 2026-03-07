export class BatchingBuffer {
  private _buffer = "";
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private readonly _flushCallback: (text: string) => void;
  private readonly _windowMs: number;

  constructor(
    flushCallback: (text: string) => void,
    windowMs = 50,
  ) {
    this._flushCallback = flushCallback;
    this._windowMs = windowMs;
  }

  append(delta: string): void {
    this._buffer += delta;

    if (this._timer === null) {
      this._timer = setTimeout(() => this.flush(), this._windowMs);
    }
  }

  flush(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    if (this._buffer.length === 0) return;

    const text = this._buffer;
    this._buffer = "";
    this._flushCallback(text);
  }

  get pending(): boolean {
    return this._buffer.length > 0;
  }

  destroy(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._buffer = "";
  }
}
