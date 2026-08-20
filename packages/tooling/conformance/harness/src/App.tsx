import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { useEffect, useState, type ReactElement } from "react";
import { getHarnessSession, subscribeHarness } from "./session";

function readQueryFlag(name: string): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return new URLSearchParams(window.location.search).get(name) === "1";
}

function Ax3BlockHandle({
	blockId,
}: {
	blockId: string;
}): ReactElement {
	return <Pen.Editor.BlockHandle blockId={blockId} />;
}

function PseudoLocaleChrome({ editor }: { editor: Editor }) {
	const slashController = {
		confirm: () => false,
		dismiss: () => {},
		items: [
			{
				type: "paragraph",
				display: { title: "Paragraph", group: "basic" },
			},
		],
		open: true,
		query: "",
		select: () => {},
		selectedIndex: 0,
		setQuery: () => {},
		editor,
	};

	return (
		<>
			<Pen.SlashMenu.Root controller={slashController} editor={editor}>
				<Pen.SlashMenu.Input />
				<Pen.SlashMenu.List />
			</Pen.SlashMenu.Root>
			<Pen.Search.Root editor={editor}>
				<Pen.Search.Input />
				<Pen.Search.Results />
				<Pen.Search.Previous />
				<Pen.Search.Next />
			</Pen.Search.Root>
		</>
	);
}

export function App() {
	const [generation, setGeneration] = useState(() => getHarnessSession().generation);

	useEffect(() => {
		return subscribeHarness(() => {
			setGeneration(getHarnessSession().generation);
		});
	}, []);

	const session = getHarnessSession();
	const showPseudoLocaleChrome = readQueryFlag("pseudoLocale");
	const showAx3Chrome = readQueryFlag("ax3");

	return (
		<Pen.Editor.Root
			key={generation}
			editor={session.editor}
			blockControls={showAx3Chrome ? Ax3BlockHandle : undefined}
		>
			<div
				data-pen-conformance-harness=""
				data-fixture={session.fixtureName}
				data-generation={String(generation)}
			>
				<Pen.Editor.Content emptyPlaceholder="" />
				{showAx3Chrome ? (
					<Pen.SlashMenu.Root>
						<Pen.SlashMenu.List />
					</Pen.SlashMenu.Root>
				) : null}
				{showPseudoLocaleChrome ? (
					<PseudoLocaleChrome editor={session.editor} />
				) : null}
			</div>
		</Pen.Editor.Root>
	);
}
