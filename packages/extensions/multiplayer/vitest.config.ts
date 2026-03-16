import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const yjsSourceEntry = fileURLToPath(
	new URL("../../crdt/yjs/src/index.ts", import.meta.url),
);

export default defineConfig({
	resolve: {
		alias: {
			"@pen/crdt-yjs": yjsSourceEntry,
		},
	},
});
