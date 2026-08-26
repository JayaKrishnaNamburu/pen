"use strict";

const { readFileSync } = require("node:fs");

const WEAK_EDGE_TYPES = new Set(["weak", "shortcut"]);

function parseHeapSnapshot(snapshotPath, options = {}) {
	const wanted = new Set(options.names ?? []);
	const maxPaths = options.maxPaths ?? 6;
	const maxDepth = options.maxDepth ?? 14;
	const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
	const meta = snap.snapshot.meta;
	const nodes = snap.nodes;
	const edges = snap.edges;
	const strings = snap.strings;
	const nodeFields = meta.node_fields;
	const edgeFields = meta.edge_fields;
	const nodeTypes = meta.node_types[0];
	const edgeTypes = meta.edge_types[0];
	const nodeFieldCount = nodeFields.length;
	const edgeFieldCount = edgeFields.length;
	const typeIdx = nodeFields.indexOf("type");
	const nameIdx = nodeFields.indexOf("name");
	const idIdx = nodeFields.indexOf("id");
	const sizeIdx = nodeFields.indexOf("self_size");
	const edgeCountIdx = nodeFields.indexOf("edge_count");
	const edgeTypeIdx = edgeFields.indexOf("type");
	const edgeNameIdx = edgeFields.indexOf("name_or_index");
	const edgeToIdx = edgeFields.indexOf("to_node");
	const nodeCount = nodes.length / nodeFieldCount;

	const firstEdge = new Uint32Array(nodeCount + 1);
	let edgeCursor = 0;
	for (let i = 0; i < nodeCount; i++) {
		firstEdge[i] = edgeCursor;
		edgeCursor += nodes[i * nodeFieldCount + edgeCountIdx] * edgeFieldCount;
	}
	firstEdge[nodeCount] = edgeCursor;

	const constructors = {};
	const targets = [];
	for (const name of wanted) {
		constructors[name] = { name, count: 0, selfSize: 0, retainedApprox: 0 };
	}

	for (let i = 0; i < nodeCount; i++) {
		const base = i * nodeFieldCount;
		const name = strings[nodes[base + nameIdx]];
		if (!wanted.has(name)) continue;
		const selfSize = nodes[base + sizeIdx];
		constructors[name].count += 1;
		constructors[name].selfSize += selfSize;
		constructors[name].retainedApprox += selfSize;
		targets.push({ index: i, name, selfSize, nodeId: nodes[base + idIdx] });
	}

	// shallow owned size: sum self_size of objects / arrays / closures this node owns
	for (const target of targets) {
		const from = firstEdge[target.index];
		const to = firstEdge[target.index + 1];
		for (let e = from; e < to; e += edgeFieldCount) {
			const edgeType = edgeTypes[edges[e + edgeTypeIdx]];
			if (WEAK_EDGE_TYPES.has(edgeType)) continue;
			const childIndex = edges[e + edgeToIdx] / nodeFieldCount;
			const childBase = childIndex * nodeFieldCount;
			const childType = nodeTypes[nodes[childBase + typeIdx]];
			if (
				childType === "object" ||
				childType === "array" ||
				childType === "closure" ||
				childType === "code"
			) {
				constructors[target.name].retainedApprox += nodes[childBase + sizeIdx];
			}
		}
	}

	const incoming = Array.from({ length: nodeCount }, () => []);
	for (let i = 0; i < nodeCount; i++) {
		const from = firstEdge[i];
		const to = firstEdge[i + 1];
		for (let e = from; e < to; e += edgeFieldCount) {
			const edgeType = edgeTypes[edges[e + edgeTypeIdx]];
			if (WEAK_EDGE_TYPES.has(edgeType)) continue;
			const childIndex = edges[e + edgeToIdx] / nodeFieldCount;
			incoming[childIndex].push({ from: i, edge: e });
		}
	}

	function edgeLabel(fromIndex, edgeOffset) {
		const edgeType = edgeTypes[edges[edgeOffset + edgeTypeIdx]];
		const nameOrIndex = edges[edgeOffset + edgeNameIdx];
		const fromBase = fromIndex * nodeFieldCount;
		const fromName = strings[nodes[fromBase + nameIdx]];
		const fromType = nodeTypes[nodes[fromBase + typeIdx]];
		let edgeName;
		if (edgeType === "element" || edgeType === "hidden") {
			edgeName = `[${nameOrIndex}]`;
		} else {
			edgeName = strings[nameOrIndex] ?? String(nameOrIndex);
		}
		return `${fromType} ${fromName} ${edgeType} ${edgeName}`;
	}

	const paths = {};
	for (const name of wanted) paths[name] = [];

	const byName = new Map();
	for (const target of targets) {
		let list = byName.get(target.name);
		if (!list) {
			list = [];
			byName.set(target.name, list);
		}
		list.push(target);
	}

	for (const [name, list] of byName) {
		list.sort((a, b) => b.selfSize - a.selfSize);
		for (const target of list.slice(0, maxPaths)) {
			paths[name].push({
				nodeId: target.nodeId,
				selfSize: target.selfSize,
				steps: shortestRetainerPath(
					target.index,
					incoming,
					edgeLabel,
					nodeTypes,
					nodes,
					nodeFieldCount,
					typeIdx,
					maxDepth,
				),
			});
		}
	}

	return {
		snapshotPath,
		nodeCount,
		constructors,
		paths,
	};
}

function shortestRetainerPath(
	start,
	incoming,
	edgeLabel,
	nodeTypes,
	nodes,
	nodeFieldCount,
	typeIdx,
	maxDepth,
) {
	const seen = new Uint8Array(incoming.length);
	const queue = [{ index: start, via: null, from: -1, depth: 0 }];
	seen[start] = 1;
	let found = null;
	for (let q = 0; q < queue.length; q++) {
		const current = queue[q];
		const type = nodeTypes[nodes[current.index * nodeFieldCount + typeIdx]];
		if (type === "synthetic" && current.index !== start) {
			found = current;
			break;
		}
		if (current.depth >= maxDepth) continue;
		for (const edge of incoming[current.index]) {
			if (seen[edge.from]) continue;
			seen[edge.from] = 1;
			queue.push({
				index: edge.from,
				via: edge.edge,
				from: q,
				depth: current.depth + 1,
			});
		}
	}
	if (!found) {
		return ["(no path to a synthetic root within depth)"];
	}
	const steps = [];
	let cursor = found;
	while (cursor && cursor.from >= 0) {
		steps.push(edgeLabel(cursor.index, cursor.via));
		cursor = queue[cursor.from];
	}
	return steps;
}

module.exports = { parseHeapSnapshot };
