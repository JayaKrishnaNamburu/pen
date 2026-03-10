import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { DropPreview } from "../../field-editor/dropResolver";
export type { DropPreview } from "../../field-editor/dropResolver";

const DropPreviewContext = createContext<DropPreview>(null);

export function DropPreviewProvider(props: {
	value: DropPreview;
	children: ReactNode;
}) {
	return (
		<DropPreviewContext.Provider value={props.value}>
			{props.children}
		</DropPreviewContext.Provider>
	);
}

export function useBlockDropPreview(
	blockId: string,
): "before" | "after" | undefined {
	const preview = useContext(DropPreviewContext);
	if (preview?.kind !== "block-edge" || preview.blockId !== blockId) {
		return undefined;
	}

	return preview.side;
}
