import { describe, expect, it } from "vitest";
import {
	aiEgressExtension,
	aiEgressFacet,
	filterAIRequest,
	streamThroughEgress,
} from "@input/pen-core";
import {
	aiEgressExtension as aiPackageEgressExtension,
	aiEgressFacet as aiPackageFacet,
	filterAIRequest as aiPackageFilter,
	streamThroughEgress as aiPackageStream,
} from "../index";

describe("AIB1 pen.aiEgress identity", () => {
	it("re-exports the core facet and helper, not a second definition", () => {
		expect(aiPackageFacet).toBe(aiEgressFacet);
		expect(aiPackageStream).toBe(streamThroughEgress);
		expect(aiPackageFilter).toBe(filterAIRequest);
		expect(aiPackageEgressExtension).toBe(aiEgressExtension);
	});
});
