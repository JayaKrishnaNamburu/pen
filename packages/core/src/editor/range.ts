import type {
  DocumentRange,
  TextSelection,
  PenDocument,
  CRDTArray,
} from "@pen/types";

export class DocumentRangeImpl implements DocumentRange {
  readonly start: { blockId: string; offset: number };
  readonly end: { blockId: string; offset: number };
  private readonly _anchor: { blockId: string; offset?: number };
  private readonly _focus: { blockId: string; offset?: number };
  private readonly _doc: PenDocument;

  constructor(
    anchor: { blockId: string; offset?: number },
    focus: { blockId: string; offset?: number },
    doc: PenDocument,
  ) {
    this._anchor = anchor;
    this._focus = focus;
    this._doc = doc;

    const anchorIdx = this._indexOfBlock(anchor.blockId);
    const focusIdx = this._indexOfBlock(focus.blockId);

    if (
      anchorIdx < focusIdx ||
      (anchorIdx === focusIdx &&
        (anchor.offset ?? 0) <= (focus.offset ?? 0))
    ) {
      this.start = {
        blockId: anchor.blockId,
        offset: anchor.offset ?? 0,
      };
      this.end = {
        blockId: focus.blockId,
        offset: focus.offset ?? 0,
      };
    } else {
      this.start = {
        blockId: focus.blockId,
        offset: focus.offset ?? 0,
      };
      this.end = {
        blockId: anchor.blockId,
        offset: anchor.offset ?? 0,
      };
    }
  }

  get isMultiBlock(): boolean {
    return this.start.blockId !== this.end.blockId;
  }

  get blockRange(): string[] {
    const startIdx = this._indexOfBlock(this.start.blockId);
    const endIdx = this._indexOfBlock(this.end.blockId);
    const result: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      result.push(
        (this._doc.blockOrder as CRDTArray<string>).get(i) as string,
      );
    }
    return result;
  }

  contains(point: { blockId: string; offset: number }): boolean {
    const idx = this._indexOfBlock(point.blockId);
    const startIdx = this._indexOfBlock(this.start.blockId);
    const endIdx = this._indexOfBlock(this.end.blockId);

    if (idx < startIdx || idx > endIdx) return false;
    if (idx > startIdx && idx < endIdx) return true;

    if (idx === startIdx && point.offset < this.start.offset) return false;
    if (idx === endIdx && point.offset > this.end.offset) return false;
    return true;
  }

  overlaps(other: DocumentRange): boolean {
    const thisStartIdx = this._indexOfBlock(this.start.blockId);
    const thisEndIdx = this._indexOfBlock(this.end.blockId);
    const otherStartIdx = this._indexOfBlock(other.start.blockId);
    const otherEndIdx = this._indexOfBlock(other.end.blockId);

    return thisStartIdx <= otherEndIdx && otherStartIdx <= thisEndIdx;
  }

  equals(other: DocumentRange): boolean {
    return (
      this.start.blockId === other.start.blockId &&
      this.start.offset === other.start.offset &&
      this.end.blockId === other.end.blockId &&
      this.end.offset === other.end.offset
    );
  }

  toTextSelection(): TextSelection {
    return {
      type: "text",
      anchor: {
        blockId: this._anchor.blockId,
        offset: this._anchor.offset ?? 0,
      },
      focus: {
        blockId: this._focus.blockId,
        offset: this._focus.offset ?? 0,
      },
      isCollapsed:
        this.start.blockId === this.end.blockId &&
        this.start.offset === this.end.offset,
      isMultiBlock: this.isMultiBlock,
      blockRange: this.blockRange,
      toRange: () => this,
    };
  }

  private _indexOfBlock(blockId: string): number {
    for (let i = 0; i < this._doc.blockOrder.length; i++) {
      if ((this._doc.blockOrder.get(i) as string) === blockId) return i;
    }
    return -1;
  }
}
