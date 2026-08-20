import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { useEffect, useState } from "react";
import { getHarnessSession, subscribeHarness } from "./session";

function readPseudoLocaleFlag(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return new URLSearchParams(window.location.search).get("pseudoLocale") === "1";
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
	const showPseudoLocaleChrome = readPseudoLocaleFlag();

	return (
		<Pen.Editor.Root key={generation} editor={session.editor}>
			<div
				data-pen-conformance-harness=""
				data-fixture={session.fixtureName}
				data-generation={String(generation)}
			>
				<Pen.Editor.Content emptyPlaceholder="" />
				{showPseudoLocaleChrome ? (
					<PseudoLocaleChrome editor={session.editor} />
				) : null}
			</div>
		</Pen.Editor.Root>
	);
}
