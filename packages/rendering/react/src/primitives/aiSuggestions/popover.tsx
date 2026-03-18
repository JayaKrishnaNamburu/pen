import React from "react";
import { createPortal } from "react-dom";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAISuggestionsContext } from "./root";

export interface AISuggestionsPopoverProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AISuggestionsPopover(props: AISuggestionsPopoverProps) {
	const { popover } = useAISuggestionsContext();
	const suggestion = popover.activeSuggestion;
	const position = popover.position;

	if (!suggestion || !position) {
		return null;
	}

	const groupTitle = popover.activeGroup?.title ?? suggestion.title;
	const groupCountLabel =
		popover.groupCount > 1
			? `${popover.activeGroupIndex + 1} of ${popover.groupCount}`
			: null;
	const kindLabel = formatSuggestionKindLabel(suggestion.kind);

	const content = renderAsChild(
		{
			...props,
			children:
				props.children ?? (
					<>
						<div
							style={{
								display: "flex",
								alignItems: "flex-start",
								justifyContent: "space-between",
								gap: 12,
								marginBottom: 12,
							}}
						>
							<div style={{ display: "grid", gap: 6 }}>
								<div
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 8,
									}}
								>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											borderRadius: 999,
											padding: "4px 8px",
											background:
												suggestion.kind === "spelling"
													? "rgba(37, 99, 235, 0.10)"
													: suggestion.kind === "grammar"
														? "rgba(8, 145, 178, 0.10)"
														: suggestion.kind === "clarity"
															? "rgba(124, 58, 237, 0.10)"
															: "rgba(14, 116, 144, 0.10)",
											color:
												suggestion.kind === "spelling"
													? "#1d4ed8"
													: suggestion.kind === "grammar"
														? "#0f766e"
														: suggestion.kind === "clarity"
															? "#6d28d9"
															: "#0f766e",
											fontSize: 11,
											fontWeight: 700,
											letterSpacing: "0.04em",
											textTransform: "uppercase",
										}}
									>
										{kindLabel}
									</span>
									{groupCountLabel ? (
										<span
											style={{
												fontSize: 12,
												color: "#64748b",
											}}
										>
											{groupCountLabel}
										</span>
									) : null}
								</div>
								<div
									style={{
										fontSize: 15,
										fontWeight: 700,
										color: "#0f172a",
										lineHeight: 1.3,
									}}
								>
									{groupTitle}
								</div>
							</div>
							{popover.groupCount > 1 ? (
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: 4,
										borderRadius: 999,
										background: "rgba(148, 163, 184, 0.10)",
									}}
								>
									<button
										type="button"
										onMouseDown={preventEditorBlur}
										onClick={popover.goToPreviousGroup}
										disabled={popover.activeGroupIndex <= 0}
										aria-label="Previous suggestion group"
										style={buildIconButtonStyle(
											popover.activeGroupIndex <= 0,
										)}
									>
										&#8249;
									</button>
									<button
										type="button"
										onMouseDown={preventEditorBlur}
										onClick={popover.goToNextGroup}
										disabled={popover.activeGroupIndex >= popover.groupCount - 1}
										aria-label="Next suggestion group"
										style={buildIconButtonStyle(
											popover.activeGroupIndex >= popover.groupCount - 1,
										)}
									>
										&#8250;
									</button>
								</div>
							) : null}
						</div>
						<div style={{ display: "grid", gap: 10 }}>
							<div
								style={{
									display: "grid",
									gap: 6,
									padding: "12px 14px",
									borderRadius: 12,
									background:
										"linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(219, 234, 254, 0.92))",
									border: "1px solid rgba(96, 165, 250, 0.28)",
								}}
							>
								<div
									style={{
										fontSize: 11,
										fontWeight: 700,
										letterSpacing: "0.04em",
										textTransform: "uppercase",
										color: "#2563eb",
									}}
								>
									Suggestion
								</div>
								<div
									style={{
										fontSize: 14,
										fontWeight: 600,
										color: "#0f172a",
										lineHeight: 1.45,
									}}
								>
									{suggestion.replacementText}
								</div>
							</div>
							{suggestion.reason ? (
								<div
									style={{
										fontSize: 13,
										lineHeight: 1.5,
										color: "#475569",
										paddingLeft: 2,
									}}
								>
									{suggestion.reason}
								</div>
							) : null}
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								gap: 8,
								marginTop: 16,
							}}
						>
							<div
								style={{
									fontSize: 12,
									color: "#94a3b8",
								}}
							>
								Apply to accept this edit.
							</div>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									onMouseDown={preventEditorBlur}
									onClick={() => {
										popover.dismissActiveGroup();
									}}
									style={SECONDARY_BUTTON_STYLE}
								>
									Dismiss
								</button>
								<button
									type="button"
									onMouseDown={preventEditorBlur}
									onClick={() => {
										popover.applyActiveGroup();
									}}
									style={PRIMARY_BUTTON_STYLE}
								>
									Apply
								</button>
							</div>
						</div>
					</>
				),
		},
		"div",
		{
			"data-pen-ai-suggestions-popover": "",
			"data-kind": suggestion.kind,
			style: {
				position: "absolute",
				top: `${Math.round(position.top)}px`,
				left: `${Math.round(position.left)}px`,
				zIndex: 70,
				width: "min(360px, calc(100vw - 24px))",
				maxWidth: "360px",
				padding: "14px",
				borderRadius: "16px",
				border: "1px solid rgba(148, 163, 184, 0.22)",
				background: "rgba(255, 255, 255, 0.96)",
				backdropFilter: "blur(10px)",
				boxShadow:
					"0 22px 60px rgba(15, 23, 42, 0.16), 0 6px 20px rgba(15, 23, 42, 0.08)",
			},
		},
	);

	return createPortal(content, document.body);
}

function preventEditorBlur(event: React.MouseEvent<HTMLElement>) {
	event.preventDefault();
}

function formatSuggestionKindLabel(kind: string): string {
	switch (kind) {
		case "spelling":
			return "Spelling";
		case "grammar":
			return "Grammar";
		case "clarity":
			return "Clarity";
		case "rephrase":
			return "Rephrase";
		default:
			return "Suggestion";
	}
}

function buildIconButtonStyle(disabled: boolean): React.CSSProperties {
	return {
		width: 28,
		height: 28,
		borderRadius: 999,
		border: "none",
		background: disabled ? "transparent" : "white",
		color: disabled ? "#cbd5e1" : "#334155",
		boxShadow: disabled ? "none" : "0 1px 3px rgba(15, 23, 42, 0.12)",
		cursor: disabled ? "not-allowed" : "pointer",
		fontSize: 18,
		lineHeight: 1,
	};
}

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
	border: "none",
	borderRadius: 10,
	padding: "9px 14px",
	background: "#2563eb",
	color: "white",
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
	boxShadow: "0 10px 20px rgba(37, 99, 235, 0.22)",
};

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
	border: "1px solid rgba(148, 163, 184, 0.3)",
	borderRadius: 10,
	padding: "9px 14px",
	background: "white",
	color: "#334155",
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
};
