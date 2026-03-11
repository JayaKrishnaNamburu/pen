import React, { useEffect, useRef } from "react";
import { createEditor, type BlockHandle, type BlockRenderContext, type Editor } from "@pen/core";
import { PenEditor } from "../penEditor";
import { useEditorContext } from "../context/editorContext";

function SubdocumentRendererInner(props: {
	block: BlockHandle;
	ctx: BlockRenderContext;
}) {
	const { block, ctx } = props;
	const {
		editor: parentEditor,
		readonly,
		importers,
		assets,
		renderers,
	} = useEditorContext();
	const childEditorRef = useRef<Editor | null>(null);
	const childScopeIdRef = useRef<string | null>(null);

	const session = parentEditor.internals.documentSession;
	const childScope = session?.getScopeForBlock(block.id) ?? null;

	if (
		session &&
		childScope &&
		(childEditorRef.current == null || childScopeIdRef.current !== childScope.id)
	) {
		childEditorRef.current?.destroy();
		childEditorRef.current = createEditor({
			schema: parentEditor.schema,
			documentSession: session,
			documentScopeId: childScope.id,
		});
		childScopeIdRef.current = childScope.id;
	}

	useEffect(() => {
		return () => {
			childEditorRef.current?.destroy();
			childEditorRef.current = null;
			childScopeIdRef.current = null;
		};
	}, []);

	const childEditor = childEditorRef.current;

	return (
		<div
			ref={ctx.ref as React.Ref<HTMLDivElement>}
			data-block-type="subdocument"
			data-selected={ctx.selected || undefined}
			data-pen-subdocument-host=""
			data-subdocument-guid={childScope?.guid}
		>
			<div data-pen-ignore-pointer-gesture="">
				{childEditor ? (
					<PenEditor
						editor={childEditor}
						readonly={readonly}
						importers={importers}
						assets={assets}
						renderers={renderers}
					/>
				) : (
					<div data-pen-subdocument-placeholder="">
						{typeof block.props.title === "string"
							? block.props.title
							: "Subdocument"}
					</div>
				)}
			</div>
		</div>
	);
}

export function SubdocumentRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	return <SubdocumentRendererInner block={block} ctx={ctx} />;
}
