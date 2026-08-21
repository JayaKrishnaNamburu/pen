type ProcessLike = {
	env?: {
		NODE_ENV?: string;
	};
};

export function isDevelopmentEnvironment(): boolean {
	const processLike = (
		globalThis as typeof globalThis & { process?: ProcessLike }
	).process;
	const nodeEnv = processLike?.env?.NODE_ENV;
	return nodeEnv !== undefined && nodeEnv !== "production";
}
