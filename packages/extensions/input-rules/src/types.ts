export type {
	InputRule,
	InputRuleHandler,
	InputRuleContext,
} from "@pen/types";

export interface InlineInputRule {
	id: string;
	trigger: string;
	pattern: RegExp;
	markType: string;
}

export interface InputRulesConfig {
	rules?: import("@pen/types").InputRule[];
	inlineRules?: InlineInputRule[];
	disableDefaults?: boolean;
	disableDefaultInlineRules?: boolean;
}
