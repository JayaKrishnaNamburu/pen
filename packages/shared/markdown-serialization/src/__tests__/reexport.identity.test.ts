import { describe, expect, it } from "vitest";
import {
  buildTableChildren as buildTableChildrenFromCore,
  getNumberedListItemValue as getNumberedListItemValueFromCore,
  sortDeltaAttributes as sortDeltaAttributesFromCore,
} from "@input/pen-core";
import {
  buildTableChildren,
  getNumberedListItemValue,
  sortDeltaAttributes,
} from "../index";

const REEXPORTS = [
  ["buildTableChildren", buildTableChildren, buildTableChildrenFromCore],
  [
    "getNumberedListItemValue",
    getNumberedListItemValue,
    getNumberedListItemValueFromCore,
  ],
  ["sortDeltaAttributes", sortDeltaAttributes, sortDeltaAttributesFromCore],
] as const;

describe("markdown-serialization re-exports the core helpers by identity", () => {
  it.each(REEXPORTS)(
    "%s is the core function, not a local copy",
    (_name, fromPackage, fromCore) => {
      expect(fromPackage).toBe(fromCore);
    },
  );
});
