#!/usr/bin/env node
import { runPropertySuite } from "./run-properties.mjs";

runPropertySuite({ nightly: false }).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
