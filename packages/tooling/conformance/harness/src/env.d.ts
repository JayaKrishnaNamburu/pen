/// <reference types="vite/client" />

import type { PenConformanceBridge } from "../../src/types";

declare global {
	interface Window {
		__penConformance: PenConformanceBridge;
	}
}

export {};
