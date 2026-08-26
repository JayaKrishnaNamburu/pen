/**
 * Live DocumentOp inventory. Reads packages/types/src/types/ops.ts and
 * extracts union members with the same tight pattern Wave 4 measures.
 * A hand-written list cannot fail when the union moves.
 */

const TIGHT_UNION_MEMBER = /^\s*\| ([A-Z][A-Za-z]+Op)/gm;

export function readLiveDocumentOpTypes(source) {
	const members = [...source.matchAll(TIGHT_UNION_MEMBER)].map(
		(match) => match[1],
	);
	const types = [];
	for (const name of members) {
		const block = source.match(
			new RegExp(
				`export interface ${name} \\{[\\s\\S]*?type:\\s*"([^"]+)"`,
			),
		);
		if (!block) {
			throw new Error(
				`op-equality could-not-check: no type literal on ${name}`,
			);
		}
		types.push({ name, type: block[1] });
	}
	return types;
}
