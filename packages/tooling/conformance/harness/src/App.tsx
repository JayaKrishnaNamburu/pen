import { Pen } from "@input/pen-react";
import { useEffect, useState } from "react";
import { getHarnessSession, subscribeHarness } from "./session";

export function App() {
	const [generation, setGeneration] = useState(() => getHarnessSession().generation);

	useEffect(() => {
		return subscribeHarness(() => {
			setGeneration(getHarnessSession().generation);
		});
	}, []);

	const session = getHarnessSession();

	return (
		<Pen.Editor.Root key={generation} editor={session.editor}>
			<div
				data-pen-conformance-harness=""
				data-fixture={session.fixtureName}
				data-generation={String(generation)}
			>
				<Pen.Editor.Content emptyPlaceholder="" />
			</div>
		</Pen.Editor.Root>
	);
}
