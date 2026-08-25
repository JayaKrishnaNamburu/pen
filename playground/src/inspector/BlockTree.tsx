import type { SnapshotBlock } from "./useDocumentSnapshot";

export function BlockTree({ blocks }: { blocks: SnapshotBlock[] }) {
	const blockItems = blocks.map((block) => {
		const propsSummary = formatProps(block.props);

		return (
			<li key={block.id} className="block-node">
				<div className="block-row">
					<span className="block-type">{block.type}</span>
					<span className="block-id">{block.id.slice(0, 6)}</span>
				</div>
				{block.text ? <p className="block-text">{block.text}</p> : null}
				{propsSummary ? <p className="block-props">{propsSummary}</p> : null}
				{block.children.length > 0 ? (
					<BlockTree blocks={block.children} />
				) : null}
			</li>
		);
	});

	return <ul className="block-tree">{blockItems}</ul>;
}

/** `type` is omitted because the badge already shows the block type. */
function formatProps(props: Record<string, unknown>): string | null {
	const entries = Object.entries(props).filter(
		([key, value]) =>
			key !== "type" && value !== null && value !== undefined && value !== "",
	);

	if (entries.length === 0) {
		return null;
	}

	return entries.map(([key, value]) => `${key}=${String(value)}`).join(" ");
}
