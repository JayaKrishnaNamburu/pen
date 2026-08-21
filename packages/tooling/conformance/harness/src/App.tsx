import type { Editor } from "@input/pen-types";
import { useEffect, useState, type ReactElement } from "react";
import { Pen } from "../../../../rendering/react/src/primitives";
import { getHarnessSession, getWindowStart, subscribeHarness } from "./session";
import { WindowedContent } from "./windowedContent";

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
	const [windowStart, setWindowStart] = useState(getWindowStart);

	useEffect(() => {
		return subscribeHarness(() => {
			setGeneration(getHarnessSession().generation);
			setWindowStart(getWindowStart());
		});
	}, []);

	const session = getHarnessSession();
	const showPseudoLocaleChrome = readQueryFlag("pseudoLocale");
	const showAx3Chrome = readQueryFlag("ax3");
	const showAx6Caret = readQueryFlag("ax6");
	const showCol2Presence = readQueryFlag("col2");
	const windowed = session.fixtureName === "windowed-large";

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
				{windowed ? (
					<WindowedContent windowStart={windowStart} />
				) : (
					<Pen.Editor.Content emptyPlaceholder="" />
				)}
				{showAx6Caret ? <Pen.Editor.CaretOverlay /> : null}
				{showCol2Presence ? (
					<>
						<Pen.Multiplayer.PresenceList />
						<Pen.Multiplayer.RemoteCursors />
						<Pen.Multiplayer.CaretOverlay />
					</>
				) : null}
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
