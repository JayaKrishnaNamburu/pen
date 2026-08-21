import { noAboveFloorApi } from "./rules/noAboveFloorApi.js";
import { noAriaHiddenVisible } from "./rules/noAriaHiddenVisible.js";
import { noAsciiWordBoundaries } from "./rules/noAsciiWordBoundaries.js";
import { noBareCaseFolding } from "./rules/noBareCaseFolding.js";
import { noBareRandomUuid } from "./rules/noBareRandomUuid.js";
import { noFrameworkFreeModulesInRenderers } from "./rules/noFrameworkFreeModulesInRenderers.js";
import { noHtmlInjectionSinks } from "./rules/noHtmlInjectionSinks.js";
import { noImplicitLocale } from "./rules/noImplicitLocale.js";
import { noModuleScopeBrowserGlobals } from "./rules/noModuleScopeBrowserGlobals.js";
import { noSelectionTimers } from "./rules/noSelectionTimers.js";
import { noUnescapedMarkupConcat } from "./rules/noUnescapedMarkupConcat.js";
import { noUnstyledFocus } from "./rules/noUnstyledFocus.js";
import { noUserFacingLiterals } from "./rules/noUserFacingLiterals.js";
import { noV1ExtensionFields } from "./rules/noV1ExtensionFields.js";

export const rules = {
	"no-above-floor-api": noAboveFloorApi,
	"no-aria-hidden-visible": noAriaHiddenVisible,
	"no-ascii-word-boundaries": noAsciiWordBoundaries,
	"no-bare-case-folding": noBareCaseFolding,
	"no-bare-random-uuid": noBareRandomUuid,
	"no-framework-free-modules-in-renderers": noFrameworkFreeModulesInRenderers,
	"no-html-injection-sinks": noHtmlInjectionSinks,
	"no-implicit-locale": noImplicitLocale,
	"no-module-scope-browser-globals": noModuleScopeBrowserGlobals,
	"no-selection-timers": noSelectionTimers,
	"no-unescaped-markup-concat": noUnescapedMarkupConcat,
	"no-unstyled-focus": noUnstyledFocus,
	"no-user-facing-literals": noUserFacingLiterals,
	"no-v1-extension-fields": noV1ExtensionFields,
};

export default { rules };
