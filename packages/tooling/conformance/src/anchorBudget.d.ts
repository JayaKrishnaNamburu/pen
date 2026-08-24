export const PG1_MISSING: "PG1_BASELINE_MISSING";
export const PG1_POPULATION: "PG1_POPULATION";

export function isPg1Record(value: unknown): value is {
	ruleId: string;
	fixture: {
		contentSha256: string;
		paragraphSha256: string;
		seed: number;
	};
	protocol: { clientID: number };
	versusSpec: Record<
		string,
		{
			enforced?: unknown;
			measured?: unknown;
			budget?: unknown;
			blown?: unknown;
		}
	>;
};

export function enforcedRows(
	versusSpec: Record<
		string,
		{
			enforced?: unknown;
			measured?: unknown;
			budget?: unknown;
			blown?: unknown;
		}
	>,
): Array<{
	name: string;
	entry: {
		enforced?: unknown;
		measured?: unknown;
		budget?: unknown;
		blown?: unknown;
	};
}>;

export function comparePg1Counts(
	fresh: {
		versusSpec: Record<
			string,
			{
				enforced?: unknown;
				measured?: unknown;
				budget?: unknown;
				blown?: unknown;
			}
		>;
	},
	committed: {
		versusSpec: Record<
			string,
			{
				enforced?: unknown;
				measured?: unknown;
				budget?: unknown;
				blown?: unknown;
			}
		>;
	},
): {
	ok: boolean;
	population: number;
	failures: Array<{ name: string; message: string }>;
};

export function formatPg1Compare(result: {
	ok: boolean;
	population: number;
	failures: Array<{ message: string }>;
}): string;
