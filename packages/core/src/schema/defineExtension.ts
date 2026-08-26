import type {
	DecorationSet,
	DocumentState,
	Editor,
	Extension,
} from "@input/pen-types";

type ExtensionCleanup = {
	expose?: Record<string, unknown>;
	destroy?: () => void;
	decorations?: (state: DocumentState) => DecorationSet;
};

type DefineExtensionConfig<TConfig = void> = Omit<
	Extension,
	"version" | "setup"
> & {
	version?: string;
	setup?: TConfig extends void
		? (editor: Editor) => ExtensionCleanup | void
		: (editor: Editor, config: TConfig) => ExtensionCleanup | void;
};

export function defineExtension<TConfig = void>(
	config: DefineExtensionConfig<TConfig>,
): Extension {
	return {
		version: "0.0.0",
		...config,
	};
}
