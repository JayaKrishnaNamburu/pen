#!/usr/bin/env node
import { runPropertySuite } from "./run-properties.mjs";

runPropertySuite({ nightly: true }).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
