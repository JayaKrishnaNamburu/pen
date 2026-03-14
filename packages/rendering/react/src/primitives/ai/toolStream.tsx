import React from "react";
import type { AIStreamEvent } from "@pen/ai";
import { useAIStreamEvents } from "../../hooks/useAIStreamEvents";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIToolStreamProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

interface ToolCallView {
	id: string;
	name: string;
	status: "running" | "complete" | "error";
	inputText: string;
	outputText: string;
	outputPartCount: number;
}

export function AIToolStream(props: AIToolStreamProps) {
	const { editor, state } = useAIContext();
	const events = useAIStreamEvents(editor);
	const activeGenerationId = state.activeGeneration?.id ?? null;
	const toolCallViews = buildToolCallViews(events, activeGenerationId);
	const visible = toolCallViews.length > 0;
	const runningToolCount = toolCallViews.filter(
		(toolCallView) => toolCallView.status === "running",
	).length;
	const toolCallNodes = toolCallViews.map((toolCallView) => (
		<div
			key={toolCallView.id}
			data-tool-call=""
			data-tool-call-id={toolCallView.id}
			data-tool-name={toolCallView.name}
			data-tool-status={toolCallView.status}
			data-tool-output-parts={toolCallView.outputPartCount}
		>
			<div data-tool-call-summary="">
				<span data-tool-call-name="">{toolCallView.name}</span>
				<span data-tool-call-status="">{toolCallView.status}</span>
			</div>
			<pre data-tool-call-input="">{toolCallView.inputText}</pre>
			<pre data-tool-call-output="">{toolCallView.outputText}</pre>
		</div>
	));

	return renderAsChild(
		{
			...props,
			children: toolCallNodes,
		},
		"div",
		{
			"data-pen-ai-tool-stream": "",
			"data-visible": visible ? "" : undefined,
			"data-tool-call-count": toolCallViews.length,
			"data-running-tool-count": runningToolCount,
			hidden: !visible,
		},
	);
}

function buildToolCallViews(
	events: readonly AIStreamEvent[],
	activeGenerationId: string | null,
): ToolCallView[] {
	const toolCallViewById = new Map<string, ToolCallView>();
	const toolCallOrder: string[] = [];

	for (const event of events) {
		if (activeGenerationId && event.generationId !== activeGenerationId) {
			continue;
		}
		if (event.type !== "tool-call" && event.type !== "tool-output" && event.type !== "tool-result") {
			continue;
		}
		const toolCallView = ensureToolCallView(
			toolCallViewById,
			toolCallOrder,
			event.toolCallId,
			event.toolName,
		);

		if (event.type === "tool-call") {
			toolCallView.inputText = formatToolStreamValue(event.input);
			toolCallView.status = "running";
			continue;
		}

		if (event.type === "tool-output") {
			toolCallView.outputText = formatToolStreamValue(event.output);
			toolCallView.outputPartCount += 1;
			toolCallView.status = "running";
			continue;
		}

		toolCallView.outputText = formatToolStreamValue(event.output);
		toolCallView.status = event.state;
	}

	return toolCallOrder
		.map((toolCallId) => toolCallViewById.get(toolCallId))
		.filter((toolCallView): toolCallView is ToolCallView => toolCallView != null);
}

function ensureToolCallView(
	toolCallViewById: Map<string, ToolCallView>,
	toolCallOrder: string[],
	toolCallId: string,
	toolName: string,
): ToolCallView {
	const existingToolCallView = toolCallViewById.get(toolCallId);
	if (existingToolCallView) {
		return existingToolCallView;
	}

	const toolCallView: ToolCallView = {
		id: toolCallId,
		name: toolName,
		status: "running",
		inputText: "",
		outputText: "",
		outputPartCount: 0,
	};
	toolCallViewById.set(toolCallId, toolCallView);
	toolCallOrder.push(toolCallId);
	return toolCallView;
}

function formatToolStreamValue(value: unknown): string {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
