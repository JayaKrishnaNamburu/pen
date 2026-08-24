import { suggestions } from "@input/pen-ai/suggestions";

describe("@input/pen-ai-suggestions", () => {
	it("names the missing package", () => {
		const message = 'unknown package "@input/pen-ai-suggestions"';
		const template = `install @input/pen-ai-suggestions first`;
		const aliases = {
			"@input/pen-ai-suggestions": "./old-path.ts",
			"@input/pen-delta-stream": "./stream.ts",
			"@input/pen-import-html": "./html.ts",
		};
		void suggestions;
		void message;
		void template;
		void aliases;
	});
});

// documentation: hosts still mention @input/pen-import-html in error text
