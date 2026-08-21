import { runEnvelopeSuite } from "./envelope/run";
import {
	parseBenchCLIArgs,
	runAllSuites,
} from "./run";

const { reporter, waiverFile, envelope, writeEnvelope } = parseBenchCLIArgs(
	process.argv.slice(2),
);

try {
	if (envelope) {
		await runEnvelopeSuite({
			reporter,
			reportResults: true,
			writeEnvelope,
		});
	} else {
		await runAllSuites({
			reporter,
			waiverFile,
			reportResults: true,
			enforceTargets: true,
		});
	}
	process.exit(0);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
}
