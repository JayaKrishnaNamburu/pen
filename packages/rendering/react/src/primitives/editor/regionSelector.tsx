import { useEffect } from "react";
import type {
	RegionSelectorActivation,
	RegionSelectorSelectionMode,
} from "@input/pen-dom";
import { useEditorRegionSelectionContext } from "./regionSelectionState";

const DEFAULT_THRESHOLD = 6;

export interface RegionSelectorProps {
	enabled?: boolean;
	threshold?: number;
	selectionMode?: RegionSelectorSelectionMode;
	activation?: RegionSelectorActivation;
	getRegionRect?: () => DOMRect | null;
}

export function EditorRegionSelector(props: RegionSelectorProps) {
	const {
		enabled = true,
		threshold = DEFAULT_THRESHOLD,
		selectionMode = "block",
		activation = "whenInactive",
		getRegionRect,
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
			getRegionRect,
		});

		return () => {
			store.setConfig(null);
			store.clearLiveRect();
		};
	}, [activation, enabled, getRegionRect, selectionMode, store, threshold]);

	return null;
}
