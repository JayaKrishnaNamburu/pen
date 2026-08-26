/**
 * Cached Intl formatters keyed by locale + options JSON (LOC3, LOC6).
 *
 * Constructing formatters in render or per-cell is a documented performance
 * trap. Callers ask the cache; the cache owns construction.
 */

export interface FormatterCache {
	getPluralRules(
		locale: string,
		options?: Intl.PluralRulesOptions,
	): Intl.PluralRules;
	getNumberFormat(
		locale: string,
		options?: Intl.NumberFormatOptions,
	): Intl.NumberFormat;
	getDateTimeFormat(
		locale: string,
		options?: Intl.DateTimeFormatOptions,
	): Intl.DateTimeFormat;
}

function formatterKey(locale: string, options: object | undefined): string {
	return `${locale}:${JSON.stringify(options ?? {})}`;
}

export function createFormatterCache(): FormatterCache {
	const pluralRules = new Map<string, Intl.PluralRules>();
	const numberFormats = new Map<string, Intl.NumberFormat>();
	const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

	return {
		getPluralRules(locale, options) {
			const key = formatterKey(locale, options);
			const cached = pluralRules.get(key);
			if (cached) {
				return cached;
			}
			const created = new Intl.PluralRules(locale, options);
			pluralRules.set(key, created);
			return created;
		},
		getNumberFormat(locale, options) {
			const key = formatterKey(locale, options);
			const cached = numberFormats.get(key);
			if (cached) {
				return cached;
			}
			const created = new Intl.NumberFormat(locale, options);
			numberFormats.set(key, created);
			return created;
		},
		getDateTimeFormat(locale, options) {
			const key = formatterKey(locale, options);
			const cached = dateTimeFormats.get(key);
			if (cached) {
				return cached;
			}
			const created = new Intl.DateTimeFormat(locale, options);
			dateTimeFormats.set(key, created);
			return created;
		},
	};
}
