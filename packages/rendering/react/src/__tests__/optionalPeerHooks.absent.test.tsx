// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { useAI, useHistory, useSearch } from "../index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@input/pen-react optional-peer hooks without extensions", () => {
	it("returns documented empty state for AI, search, and history on a bare editor", async () => {
		const editor = createEditor({ schema: defaultSchema });
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		function Probe() {
			const ai = useAI(editor);
			const search = useSearch(editor);
			const history = useHistory(editor);

			return (
				<div
					data-ai-status={ai.status}
					data-ai-session-count={ai.sessions.length}
					data-ai-suggest-mode={String(ai.suggestMode)}
					data-ai-command-menu={String(ai.commandMenuOpen)}
					data-search-open={String(search.open)}
					data-search-query={search.query}
					data-search-matches={search.matches.length}
					data-search-active-index={search.activeIndex}
					data-history-snapshots={history.snapshots.length}
					data-history-restoring={String(history.isRestoring)}
				/>
			);
		}

		await act(async () => {
			root.render(<Probe />);
		});

		const probe = container.querySelector("div");
		expect(probe?.getAttribute("data-ai-status")).toBe("idle");
		expect(probe?.getAttribute("data-ai-session-count")).toBe("0");
		expect(probe?.getAttribute("data-ai-suggest-mode")).toBe("false");
		expect(probe?.getAttribute("data-ai-command-menu")).toBe("false");
		expect(probe?.getAttribute("data-search-open")).toBe("false");
		expect(probe?.getAttribute("data-search-query")).toBe("");
		expect(probe?.getAttribute("data-search-matches")).toBe("0");
		expect(probe?.getAttribute("data-search-active-index")).toBe("-1");
		expect(probe?.getAttribute("data-history-snapshots")).toBe("0");
		expect(probe?.getAttribute("data-history-restoring")).toBe("false");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
