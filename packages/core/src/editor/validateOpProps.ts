import type {
	BlockSchema,
	DiagnosticEvent,
	PropSchema,
} from "@input/pen-types";

import { deepEqual } from "../schema/normalize";

export type ValidateOpPropsResult = {
	props: Record<string, unknown>;
	diagnostics: DiagnosticEvent[];
};

export function validateOpProps(
	schema: Pick<BlockSchema, "propSchema" | "validateProps">,
	props: Record<string, unknown>,
): ValidateOpPropsResult {
	const validate = schema.validateProps;
	if (!validate) {
		return { props, diagnostics: [] };
	}

	const declared: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (key in schema.propSchema) {
			declared[key] = value;
		}
	}

	if (Object.keys(declared).length === 0) {
		return { props, diagnostics: [] };
	}

	const validated = validate(declared);
	const next: Record<string, unknown> = { ...props };
	const diagnostics: DiagnosticEvent[] = [];
	let changed = false;

	for (const key of Object.keys(declared)) {
		const incoming = declared[key];
		const outgoing = validated[key];
		// Structural, not reference: validateProps returns a fresh array/object for
		// every non-primitive prop, so Object.is reports an unchanged value as changed.
		if (deepEqual(incoming, outgoing)) {
			continue;
		}
		next[key] = outgoing;
		changed = true;
		if (isUnsalvageable(incoming, outgoing, schema.propSchema[key])) {
			diagnostics.push({
				code: "prop-invalid",
				level: "warn",
				source: "schema",
				message: `Invalid prop "${key}"`,
				prop: key,
				value: incoming,
				fallback: outgoing,
			});
		}
	}

	return { props: changed ? next : props, diagnostics };
}

function isUnsalvageable(
	incoming: unknown,
	outgoing: unknown,
	propSchema: PropSchema | undefined,
): boolean {
	if (!propSchema) {
		return true;
	}

	const schemaType = Array.isArray(propSchema.type)
		? propSchema.type[0]
		: propSchema.type;
	let candidate = incoming;

	if (schemaType === "number" && typeof incoming === "string") {
		const parsed = Number(incoming);
		if (!Number.isNaN(parsed)) {
			candidate = parsed;
		}
	} else if (schemaType === "boolean" && typeof incoming === "string") {
		candidate = incoming === "true";
	}

	if (typeof candidate === "number") {
		let clamped = candidate;
		if (propSchema.minimum !== undefined && clamped < propSchema.minimum) {
			clamped = propSchema.minimum;
		}
		if (propSchema.maximum !== undefined && clamped > propSchema.maximum) {
			clamped = propSchema.maximum;
		}
		if (Object.is(clamped, outgoing)) {
			return false;
		}
	} else if (Object.is(candidate, outgoing)) {
		return false;
	}

	return true;
}
