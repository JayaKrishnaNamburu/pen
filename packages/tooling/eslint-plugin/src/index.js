import { noAriaHiddenVisible } from "./rules/noAriaHiddenVisible.js";
import { noAsciiWordBoundaries } from "./rules/noAsciiWordBoundaries.js";
import { noBareCaseFolding } from "./rules/noBareCaseFolding.js";
import { noBareRandomUuid } from "./rules/noBareRandomUuid.js";
import { noHtmlInjectionSinks } from "./rules/noHtmlInjectionSinks.js";
import { noImplicitLocale } from "./rules/noImplicitLocale.js";
import { noModuleScopeBrowserGlobals } from "./rules/noModuleScopeBrowserGlobals.js";
import { noUnescapedMarkupConcat } from "./rules/noUnescapedMarkupConcat.js";
import { noUnstyledFocus } from "./rules/noUnstyledFocus.js";
import { noUserFacingLiterals } from "./rules/noUserFacingLiterals.js";

export const rules = {
	"no-aria-hidden-visible": noAriaHiddenVisible,
	"no-ascii-word-boundaries": noAsciiWordBoundaries,
	"no-bare-case-folding": noBareCaseFolding,
	"no-bare-random-uuid": noBareRandomUuid,
	"no-html-injection-sinks": noHtmlInjectionSinks,
	"no-implicit-locale": noImplicitLocale,
	"no-module-scope-browser-globals": noModuleScopeBrowserGlobals,
	"no-unescaped-markup-concat": noUnescapedMarkupConcat,
	"no-unstyled-focus": noUnstyledFocus,
	"no-user-facing-literals": noUserFacingLiterals,
};

export default { rules };
