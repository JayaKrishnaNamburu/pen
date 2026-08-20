import { describe, expect, it } from "vitest";

import { createFormatterCache } from "../i18n/formatters";

describe("createFormatterCache", () => {
	it("LOC6: same options return identity-stable instance", () => {
		const cache = createFormatterCache();
		const numberOptions = { maximumFractionDigits: 2 };
		const pluralOptions = { type: "cardinal" } as const;
		const dateOptions = { dateStyle: "medium" } as const;

		expect(cache.getNumberFormat("en", numberOptions)).toBe(
			cache.getNumberFormat("en", { maximumFractionDigits: 2 }),
		);
		expect(cache.getPluralRules("en", pluralOptions)).toBe(
			cache.getPluralRules("en", { type: "cardinal" }),
		);
		expect(cache.getDateTimeFormat("en", dateOptions)).toBe(
			cache.getDateTimeFormat("en", { dateStyle: "medium" }),
		);
	});

	it("LOC6: omitted options and empty options share an instance", () => {
		const cache = createFormatterCache();

		expect(cache.getNumberFormat("en")).toBe(cache.getNumberFormat("en", {}));
		expect(cache.getPluralRules("ar")).toBe(cache.getPluralRules("ar", {}));
		expect(cache.getDateTimeFormat("de-DE")).toBe(
			cache.getDateTimeFormat("de-DE", {}),
		);
	});

	it("LOC6: different locale does not return the same instance", () => {
		const cache = createFormatterCache();
		const numberOptions = { maximumFractionDigits: 2 };
		const pluralOptions = { type: "cardinal" } as const;
		const dateOptions = { dateStyle: "medium" } as const;

		expect(cache.getNumberFormat("en", numberOptions)).not.toBe(
			cache.getNumberFormat("de-DE", numberOptions),
		);
		expect(cache.getPluralRules("en", pluralOptions)).not.toBe(
			cache.getPluralRules("ar", pluralOptions),
		);
		expect(cache.getDateTimeFormat("en", dateOptions)).not.toBe(
			cache.getDateTimeFormat("de-DE", dateOptions),
		);
	});

	it("LOC6: different options do not return the same instance", () => {
		const cache = createFormatterCache();

		expect(cache.getNumberFormat("en", { maximumFractionDigits: 2 })).not.toBe(
			cache.getNumberFormat("en", { maximumFractionDigits: 0 }),
		);
		expect(cache.getPluralRules("en", { type: "cardinal" })).not.toBe(
			cache.getPluralRules("en", { type: "ordinal" }),
		);
		expect(cache.getDateTimeFormat("en", { dateStyle: "medium" })).not.toBe(
			cache.getDateTimeFormat("en", { dateStyle: "short" }),
		);
	});

	it("LOC6: Arabic PluralRules select more than two categories", () => {
		const cache = createFormatterCache();
		const rules = cache.getPluralRules("ar");

		expect(rules.select(0)).toBe("zero");
		expect(rules.select(1)).toBe("one");
		expect(rules.select(2)).toBe("two");
		expect(rules.select(3)).toBe("few");
		expect(rules.select(11)).toBe("many");
		expect(rules.select(100)).toBe("other");
	});
});
