import type {
  Decoration,
  DecorationSet,
  InlineDecoration,
  PositionMapping,
} from "@pen/types";

let nextGeneration = 1;

const EMPTY_ARRAY: readonly Decoration[] = Object.freeze([]);

class DecorationSetImpl implements DecorationSet {
  readonly decorations: readonly Decoration[];
  readonly generation: number;
  private readonly _blockIndex: Map<string, Decoration[]>;

  constructor(decorations: Decoration[], generation?: number) {
    this.decorations = decorations;
    this.generation = generation ?? nextGeneration++;
    this._blockIndex = new Map();

    for (const dec of decorations) {
      const key = dec.blockId;
      let list = this._blockIndex.get(key);
      if (!list) {
        list = [];
        this._blockIndex.set(key, list);
      }
      list.push(dec);
    }
  }

  forBlock(blockId: string): readonly Decoration[] {
    return this._blockIndex.get(blockId) ?? EMPTY_ARRAY;
  }

  inlineForBlock(blockId: string): readonly InlineDecoration[] {
    const all = this.forBlock(blockId);
    return all.filter(
      (d): d is InlineDecoration => d.type === "inline",
    );
  }

  equals(other: DecorationSet): boolean {
    return this.generation === other.generation;
  }

  map(mapping: PositionMapping): DecorationSet {
    if (!mapping.affectedBlocks || mapping.affectedBlocks.length === 0) {
      return this;
    }

    const affected = new Set(mapping.affectedBlocks);
    let changed = false;
    const mapped: Decoration[] = [];

    for (const dec of this.decorations) {
      if (dec.type === "inline" && affected.has(dec.blockId)) {
        const newFrom = mapping.mapOffset(dec.blockId, dec.from);
        const newTo = mapping.mapOffset(dec.blockId, dec.to);

        if (newFrom >= newTo) continue;

        if (newFrom !== dec.from || newTo !== dec.to) {
          changed = true;
          mapped.push({ ...dec, from: newFrom, to: newTo });
          continue;
        }
      }
      mapped.push(dec);
    }

    if (!changed && mapped.length === this.decorations.length) {
      return this;
    }

    return new DecorationSetImpl(mapped);
  }
}

const EMPTY_SET = new DecorationSetImpl([], 0);

export function createDecorationSet(
  decorations: Decoration[],
): DecorationSet {
  if (decorations.length === 0) return EMPTY_SET;
  return new DecorationSetImpl(decorations);
}

export function emptyDecorationSet(): DecorationSet {
  return EMPTY_SET;
}

export function mergeDecorationSets(
  ...sets: DecorationSet[]
): DecorationSet {
  const all: Decoration[] = [];
  for (const set of sets) {
    all.push(...set.decorations);
  }
  if (all.length === 0) return EMPTY_SET;
  return new DecorationSetImpl(all);
}
