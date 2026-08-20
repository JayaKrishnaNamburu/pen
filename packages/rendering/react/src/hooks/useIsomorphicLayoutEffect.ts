import {
	useEffect,
	useLayoutEffect as useIsomorphicLayoutEffectClient,
} from "react";

function canUseDomLayoutEffect(): boolean {
	return typeof document !== "undefined";
}

// HOST5: client keeps layout timing; a server pass binds useEffect so React
// emits zero warnings.
export const useIsomorphicLayoutEffect = canUseDomLayoutEffect()
	? useIsomorphicLayoutEffectClient
	: useEffect;
