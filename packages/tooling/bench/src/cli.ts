import {
	parseBenchCLIArgs,
	runAllSuites,
} from "./run";

const { reporter, waiverFile } = parseBenchCLIArgs(process.argv.slice(2));

try {
	await runAllSuites({
		reporter,
		waiverFile,
		reportResults: true,
		enforceTargets: true,
	});
	process.exit(0);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
}
