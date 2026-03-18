import { describe, expect, it } from "vitest";
import {
	LOCAL_OPERATION_PAYLOAD_END,
	LOCAL_OPERATION_PAYLOAD_START,
	createLocalOperationPayloadCollector,
} from "./localOperationPayload";

describe("localOperationPayload", () => {
	it("extracts payload previews and finals from wrapped output", () => {
		const collector = createLocalOperationPayloadCollector();

		expect(
			collector.push(`${LOCAL_OPERATION_PAYLOAD_START}Hello`).text,
		).toBe("Hello");
		expect(
			collector.push(` world${LOCAL_OPERATION_PAYLOAD_END}`).text,
		).toBe("Hello world");
		expect(collector.finalize()).toEqual({
			ok: true,
			text: "Hello world",
		});
	});

	it("hides a partially streamed closing payload marker from preview text", () => {
		const collector = createLocalOperationPayloadCollector();

		expect(
			collector.push(`${LOCAL_OPERATION_PAYLOAD_START}Hello world</pen_local_operation`).text,
		).toBe("Hello world");
		expect(
			collector.push(">").text,
		).toBe("Hello world");
		expect(collector.finalize()).toEqual({
			ok: true,
			text: "Hello world",
		});
	});

	it("rejects narration outside the payload wrapper", () => {
		const collector = createLocalOperationPayloadCollector();

		collector.push(
			`Let me think ${LOCAL_OPERATION_PAYLOAD_START}Hello${LOCAL_OPERATION_PAYLOAD_END}`,
		);

		expect(collector.finalize()).toEqual({
			ok: false,
			reason:
				"The local AI operation returned narration outside the payload wrapper.",
		});
	});
});
