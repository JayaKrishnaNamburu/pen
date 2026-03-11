import React from "react";
import { describe, expect, it } from "vitest";
import { resolveRenderer, SubdocumentRenderer } from "../index";

describe("@pen/react subdocument rendering", () => {
	it("registers the subdocument renderer in the public renderer map", () => {
		expect(resolveRenderer("subdocument")).toBe(SubdocumentRenderer);
		expect(typeof SubdocumentRenderer).toBe("function");
	});
});
