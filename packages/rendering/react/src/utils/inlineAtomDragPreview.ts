import { DATA_ATTRS } from "./dataAttributes";

const DRAG_PREVIEW_ROOT_ATTR = "data-pen-inline-atom-drag-preview-root";
const DRAG_PREVIEW_ATTR = "data-pen-inline-atom-drag-preview";

export interface InlineAtomDragPreview {
	element: HTMLElement;
	updatePosition(clientX: number, clientY: number): void;
	destroy(): void;
}

export function createInlineAtomDragPreview(args: {
	sourceElement: HTMLElement;
	clientX: number;
	clientY: number;
}): InlineAtomDragPreview {
	const { sourceElement } = args;
	const ownerDocument = sourceElement.ownerDocument;
	const root = getPreviewRoot(ownerDocument);
	const rect = sourceElement.getBoundingClientRect();
	const grabOffsetX = Math.max(0, args.clientX - rect.left);
	const grabOffsetY = Math.max(0, args.clientY - rect.top);
	const preview = ownerDocument.createElement("div");
	preview.setAttribute(DRAG_PREVIEW_ATTR, "");
	preview.setAttribute("aria-hidden", "true");
	preview.style.position = "fixed";
	preview.style.top = "0";
	preview.style.left = "0";
	preview.style.pointerEvents = "none";
	preview.style.zIndex = "2147483647";
	preview.style.opacity = "0.96";
	preview.style.width = `${rect.width}px`;
	preview.style.maxWidth = "min(480px, calc(100vw - 48px))";
	preview.style.filter = "drop-shadow(0 12px 28px rgba(0, 0, 0, 0.22))";
	preview.style.willChange = "transform";

	const clone = sourceElement.cloneNode(true) as HTMLElement;
	removeDuplicateIds(clone);
	resetInlineAtomStateAttrs(clone);
	clone.style.margin = "0";
	clone.style.pointerEvents = "none";
	preview.append(clone);
	root.replaceChildren(preview);

	const updatePosition = (clientX: number, clientY: number) => {
		preview.style.transform = `translate3d(${clientX - grabOffsetX}px, ${clientY - grabOffsetY}px, 0)`;
	};

	updatePosition(args.clientX, args.clientY);

	return {
		element: preview,
		updatePosition,
		destroy() {
			preview.remove();
			if (root.childElementCount === 0) {
				root.remove();
			}
		},
	};
}

export function clearInlineAtomDragPreview(
	ownerDocument: Document | null | undefined,
) {
	if (!ownerDocument) {
		return;
	}

	const previewRoot = ownerDocument.querySelector(
		`[${DRAG_PREVIEW_ROOT_ATTR}]`,
	) as HTMLElement | null;
	if (!previewRoot) {
		return;
	}

	previewRoot.replaceChildren();
	previewRoot.remove();
}

function getPreviewRoot(ownerDocument: Document): HTMLElement {
	let root = ownerDocument.querySelector(
		`[${DRAG_PREVIEW_ROOT_ATTR}]`,
	) as HTMLElement | null;
	if (root) {
		return root;
	}

	root = ownerDocument.createElement("div");
	root.setAttribute(DRAG_PREVIEW_ROOT_ATTR, "");
	root.style.position = "fixed";
	root.style.top = "0";
	root.style.left = "0";
	root.style.width = "0";
	root.style.height = "0";
	root.style.pointerEvents = "none";
	root.style.zIndex = "2147483647";
	ownerDocument.body.append(root);
	return root;
}

function removeDuplicateIds(clone: HTMLElement) {
	if (clone.id) {
		clone.removeAttribute("id");
	}

	for (const element of clone.querySelectorAll("[id]")) {
		element.removeAttribute("id");
	}
}

function resetInlineAtomStateAttrs(clone: HTMLElement) {
	const attrsToReset = [
		DATA_ATTRS.selected,
		DATA_ATTRS.dragging,
		DATA_ATTRS.inlineAtomDragging,
		DATA_ATTRS.dropTarget,
		DATA_ATTRS.dropPosition,
		DATA_ATTRS.focused,
	];

	for (const attr of attrsToReset) {
		clone.removeAttribute(attr);
		for (const element of clone.querySelectorAll(`[${attr}]`)) {
			element.removeAttribute(attr);
		}
	}
}
