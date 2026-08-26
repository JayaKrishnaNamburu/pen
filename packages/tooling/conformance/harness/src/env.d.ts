/// <reference types="vite/client" />

import type { PenConformanceBridge } from "../../src/types";

declare global {
	interface Window {
		__penConformance: PenConformanceBridge;
		__xssProbe: () => void;
		__xssProbeTripped: boolean;
	}
}

export {};
