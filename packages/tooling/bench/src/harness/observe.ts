/**
 * A count a no-op cannot satisfy. The named error is the
 * published failure mode; a missing call is a missing observation.
 */
export function assertObservedCount(
	name: string,
	actual: number,
	expected: number,
): void {
	if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
		throw new Error(
			`${name} ${actual} !== ${expected}; observation counts must be finite`,
		);
	}
	if (expected <= 0) {
		throw new Error(
			`${name} expected ${expected} is not a count a no-op cannot satisfy`,
		);
	}
	if (actual !== expected) {
		throw new Error(`${name} ${actual} !== ${expected}`);
	}
}

export function assertObservedAtLeast(
	name: string,
	actual: number,
	min: number,
): void {
	if (!Number.isFinite(actual) || !Number.isFinite(min)) {
		throw new Error(
			`${name} ${actual} < ${min}; observation counts must be finite`,
		);
	}
	if (min <= 0) {
		throw new Error(
			`${name} min ${min} is not a count a no-op cannot satisfy`,
		);
	}
	if (actual < min) {
		throw new Error(`${name} ${actual} < ${min}`);
	}
}

export interface PublishedObservation {
	name: string;
	actual: number;
	expected: number;
}

/**
 * After the clock: a published duration must name an observation.
 * A wall-clock without a floor still needs a count a no-op cannot satisfy.
 */
export function assertPublishedObservation(
	id: string,
	observed: PublishedObservation | null,
	hasFloor: boolean,
): void {
	if (!observed) {
		throw new Error(`post-clock observation missing for ${id}`);
	}
	assertObservedCount(observed.name, observed.actual, observed.expected);
	if (!hasFloor && observed.actual <= 0) {
		throw new Error(
			`${id} reported a duration without a harness floor or a count a no-op cannot satisfy`,
		);
	}
}

export interface BenchPopulationEntry {
	id: string;
	name: string;
}

/**
 * A registry is a population claim. Drift in either direction
 * is a named failure, not a silent extra or missing row.
 */
export function assertBenchmarkMetadataParity(
	registered: readonly BenchPopulationEntry[],
	running: readonly BenchPopulationEntry[],
): void {
	const registeredIds = registered.map((entry) => entry.id);
	const runningIds = running.map((entry) => entry.id);
	const registeredSet = new Set(registeredIds);
	const runningSet = new Set(runningIds);

	if (registeredSet.size !== registeredIds.length) {
		throw new Error("registered benchmark metadata has duplicate ids");
	}
	if (runningSet.size !== runningIds.length) {
		throw new Error("running benchmark suite has duplicate ids");
	}

	const registeredButNotRunning = registeredIds.filter(
		(id) => !runningSet.has(id),
	);
	const runningButNotRegistered = runningIds.filter(
		(id) => !registeredSet.has(id),
	);

	if (registeredButNotRunning.length > 0 || runningButNotRegistered.length > 0) {
		const parts: string[] = [];
		if (registeredButNotRunning.length > 0) {
			parts.push(
				`registered but not running: ${registeredButNotRunning.join(", ")}`,
			);
		}
		if (runningButNotRegistered.length > 0) {
			parts.push(
				`running but not registered: ${runningButNotRegistered.join(", ")}`,
			);
		}
		throw new Error(
			`benchmark metadata population mismatch: ${parts.join("; ")}`,
		);
	}

	const registeredById = new Map(
		registered.map((entry) => [entry.id, entry] as const),
	);
	for (const bench of running) {
		const meta = registeredById.get(bench.id);
		if (meta && meta.name !== bench.name) {
			throw new Error(
				`benchmark metadata name mismatch for ${bench.id}: running ${JSON.stringify(bench.name)} !== registered ${JSON.stringify(meta.name)}`,
			);
		}
	}
}
