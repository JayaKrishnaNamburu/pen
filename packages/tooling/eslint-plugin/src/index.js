import { noBareRandomUuid } from "./rules/noBareRandomUuid.js";
import { noHtmlInjectionSinks } from "./rules/noHtmlInjectionSinks.js";
import { noModuleScopeBrowserGlobals } from "./rules/noModuleScopeBrowserGlobals.js";

export const rules = {
	"no-bare-random-uuid": noBareRandomUuid,
	"no-html-injection-sinks": noHtmlInjectionSinks,
	"no-module-scope-browser-globals": noModuleScopeBrowserGlobals,
};

export default { rules };
