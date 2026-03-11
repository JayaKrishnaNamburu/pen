import { useEffect } from "react";
import {
	useEditorRegionSelectionContext,
	type RegionSelectorActivation,
	type RegionSelectorSelectionMode,
} from "./regionSelectionState";

const DEFAULT_THRESHOLD = 6;

export interface RegionSelectorProps {
	enabled?: boolean;
	threshold?: number;
	selectionMode?: RegionSelectorSelectionMode;
	activation?: RegionSelectorActivation;
}

export function EditorRegionSelector(props: RegionSelectorProps) {
	const {
		enabled = true,
		threshold = DEFAULT_THRESHOLD,
		selectionMode = "block",
		activation = "whenInactive",
	} = props;
	const { store } = useEditorRegionSelectionContext();

	useEffect(() => {
		if (!enabled) {
			store.setConfig(null);
			return () => {
				store.setConfig(null);
			};
		}

		store.setConfig({
			enabled,
			threshold,
			selectionMode,
			activation,
		});

		return () => {
			store.setConfig(null);
			store.clearLiveRect();
		};
	}, [activation, enabled, selectionMode, store, threshold]);

	return null;
}
