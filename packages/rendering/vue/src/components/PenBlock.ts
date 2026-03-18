import { DATA_ATTRS } from "@pen/dom/utils/dataAttributes";
import type { BlockHandle, CellSelection } from "@pen/types";
import { defineComponent, h, type VNode, type VNodeChild } from "vue";
import { useSelection } from "../composables/useSelection";
import {
  isBlockSelected,
  isCellInSelection,
  resolveExpandedSurfaceRole,
  resolveNumberedListValue,
  useBlockModel,
  useFieldEditorState,
  useParentIdChildBlockIds,
} from "../internal/editorState";
import { useEditorContext } from "../internal/editorContext";
import { useFieldEditorContext } from "../internal/fieldEditorContext";
import type { PenBlockRenderContext } from "../types";
import { PenInlineContent } from "./PenInlineContent";
import { PenTableCellContent } from "./PenTableCellContent";

export const PenBlock = defineComponent({
  name: "PenBlock",
  props: {
    blockId: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const { editor, readonly, renderers } = useEditorContext();
    const fieldEditor = useFieldEditorContext();
    const selection = useSelection(editor);
    const fieldEditorState = useFieldEditorState(fieldEditor);
    const blockModel = useBlockModel(editor, props.blockId);
    const childBlockIds = useParentIdChildBlockIds(editor, props.blockId);

    return (): VNode | null => {
      if (!blockModel.value.exists) {
        return null;
      }

      const block = editor.getBlock(props.blockId);
      if (!block) {
        return null;
      }

      const isSelected = isBlockSelected(selection.value, props.blockId);
      const isFocused = fieldEditorState.value.focusBlockId === props.blockId;
      const surfaceRole = resolveExpandedSurfaceRole(
        editor,
        fieldEditorState.value,
        props.blockId,
      );
      const childNodes: VNode[] = childBlockIds.value.map((childBlockId) =>
        h(PenBlock, {
          key: childBlockId,
          blockId: childBlockId,
        }),
      );
      const renderInlineContent: PenBlockRenderContext["renderInlineContent"] = (
        options,
      ) =>
        h(PenInlineContent, {
          blockId: block.id,
          ...(options?.as ? { as: options.as } : {}),
          ...(options?.placeholder ? { placeholder: options.placeholder } : {}),
        });
      const overrideRenderer = renderers.value?.[block.type];
      const blockBody: VNodeChild = overrideRenderer
        ? overrideRenderer(block, {
            readonly: readonly.value,
            selected: isSelected,
            focused: isFocused,
            childNodes,
            renderInlineContent,
          })
        : renderBlockBody({
            block,
            readonly: readonly.value,
            childNodes,
            toggleFieldEditor: fieldEditor,
            editor,
            selection: selection.value,
            renderInlineContent,
          });

      return h(
        "div",
        {
          [DATA_ATTRS.editorBlock]: "",
          [DATA_ATTRS.blockId]: props.blockId,
          [DATA_ATTRS.blockType]: block.type,
          [DATA_ATTRS.selected]: isSelected || undefined,
          [DATA_ATTRS.focused]: isFocused || undefined,
          [DATA_ATTRS.surfaceRole]: surfaceRole ?? undefined,
          tabIndex: -1,
          contentEditable:
            surfaceRole != null && surfaceRole !== "editable-inline"
              ? false
              : undefined,
        },
        [blockBody],
      );
    };
  },
});

function renderBlockBody(args: {
  block: BlockHandle;
  readonly: boolean;
  childNodes: PenBlockRenderContext["childNodes"];
  toggleFieldEditor: ReturnType<typeof useFieldEditorContext>;
  editor: ReturnType<typeof useEditorContext>["editor"];
  selection: ReturnType<typeof useSelection>["value"];
  renderInlineContent: PenBlockRenderContext["renderInlineContent"];
}) {
  const {
    block,
    readonly,
    childNodes,
    toggleFieldEditor,
    editor,
    selection,
    renderInlineContent,
  } = args;

  switch (block.type) {
    case "paragraph":
      return h("div", { "data-block-type": "paragraph" }, [
        renderInlineContent(),
      ]);
    case "heading": {
      const level = clampHeadingLevel(block.props.level);
      return h(`h${level}`, { "data-block-type": "heading", "data-level": level }, [
        renderInlineContent(),
      ]);
    }
    case "bulletListItem": {
      const indent = resolveIndent(block);
      return h(
        "div",
        {
          "data-block-type": "bulletListItem",
          style: { marginLeft: `${indent * 24}px` },
        },
        [
          h("span", { "data-pen-list-marker": "", "aria-hidden": "true" }, "-"),
          renderInlineContent(),
        ],
      );
    }
    case "numberedListItem": {
      const indent = resolveIndent(block);
      const value = resolveNumberedListValue(editor, block.id);
      return h(
        "div",
        {
          "data-block-type": "numberedListItem",
          "data-counter": value,
          style: { marginLeft: `${indent * 24}px` },
        },
        [
          h(
            "span",
            { "data-pen-list-marker": "", "aria-hidden": "true" },
            `${value}.`,
          ),
          renderInlineContent(),
        ],
      );
    }
    case "checkListItem": {
      const indent = resolveIndent(block);
      const checked = Boolean(block.props.checked);

      return h(
        "div",
        {
          "data-block-type": "checkListItem",
          "data-checked": checked || undefined,
          style: { marginLeft: `${indent * 24}px` },
        },
        [
          h("input", {
            type: "checkbox",
            checked,
            disabled: readonly,
            onChange: () => {
              if (readonly) {
                return;
              }
              editor.apply(
                [
                  {
                    type: "update-block",
                    blockId: block.id,
                    props: { checked: !checked },
                  },
                ],
                { origin: "user" },
              );
            },
          }),
          renderInlineContent(),
        ],
      );
    }
    case "callout": {
      const calloutType = (block.props.type as string) ?? "info";
      const icon =
        calloutType === "warning"
          ? "!"
          : calloutType === "error"
            ? "x"
            : "i";
      const childContainer =
        childNodes.length > 0
          ? h("div", { "data-pen-callout-children": "" }, childNodes)
          : null;

      return h(
        "div",
        {
          "data-block-type": "callout",
          "data-callout-type": calloutType,
          role: "note",
        },
        [
          h("span", { "data-pen-callout-icon": "", "aria-hidden": "true" }, icon),
          h("div", { "data-pen-callout-body": "" }, [
            renderInlineContent(),
            childContainer,
          ]),
        ],
      );
    }
    case "toggle": {
      const open = Boolean(block.props.open);
      const childContainer =
        open && childNodes.length > 0
          ? h("div", { "data-pen-toggle-body": "" }, childNodes)
          : null;

      return h("div", { "data-block-type": "toggle" }, [
        h("div", { "data-pen-toggle-header": "" }, [
          h(
            "button",
            {
              type: "button",
              "data-pen-toggle-trigger": "",
              "data-pen-ignore-pointer-gesture": "",
              "aria-expanded": open,
              onMousedown: (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFieldEditor?.blur();
              },
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                if (readonly) {
                  return;
                }
                editor.apply(
                  [
                    {
                      type: "update-block",
                      blockId: block.id,
                      props: { open: !open },
                    },
                  ],
                  { origin: "user" },
                );
              },
            },
            open ? "v" : ">",
          ),
          h("div", { "data-pen-toggle-title": "" }, [
            renderInlineContent(),
          ]),
        ]),
        childContainer,
      ]);
    }
    case "blockquote": {
      const childContainer =
        childNodes.length > 0
          ? h("div", { "data-pen-blockquote-children": "" }, childNodes)
          : null;

      return h("blockquote", { "data-block-type": "blockquote" }, [
        renderInlineContent(),
        childContainer,
      ]);
    }
    case "divider":
      return h("hr", { "data-block-type": "divider" });
    case "codeBlock": {
      const language = (block.props.language as string | undefined) ?? undefined;
      return h(
        "pre",
        {
          "data-block-type": "codeBlock",
          "data-language": language,
        },
        [
          h(
            "code",
            { class: language ? `language-${language}` : undefined },
            [renderInlineContent()],
          ),
        ],
      );
    }
    case "image": {
      const caption =
        typeof block.props.caption === "string" ? block.props.caption : "";
      const width =
        typeof block.props.width === "number" ? block.props.width : undefined;

      return h("figure", { "data-block-type": "image" }, [
        h("img", {
          src: String(block.props.src ?? ""),
          alt: String(block.props.alt ?? ""),
          style: width ? { width: `${width}px` } : undefined,
        }),
        caption ? h("figcaption", {}, caption) : null,
      ]);
    }
    case "table":
      return renderTable(block, editor, readonly, toggleFieldEditor, selection);
    default:
      return h("div", { "data-block-type": block.type, "data-unknown-block": "" }, [
        h("span", { "data-pen-unknown-type": "" }, block.type),
      ]);
  }
}

function renderTable(
  block: BlockHandle,
  editor: ReturnType<typeof useEditorContext>["editor"],
  readonly: boolean,
  fieldEditor: ReturnType<typeof useFieldEditorContext>,
  selection: ReturnType<typeof useSelection>["value"],
) {
  const rowCount = block.tableRowCount();
  const columnCount = block.tableColumnCount();
  const hasHeaderRow = Boolean(block.props.hasHeaderRow);
  const cellSelection =
    selection?.type === "cell" && selection.blockId === block.id ? selection : null;

  const bodyRows: VNode[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const isHeaderRow = hasHeaderRow && rowIndex === 0;
    const cellNodes: VNode[] = [];

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellTag = isHeaderRow ? "th" : "td";
      const isSelectedCell =
        cellSelection != null &&
        isCellInSelection(cellSelection, rowIndex, columnIndex);
      const placeholder = isHeaderRow
        ? `Column ${columnIndex + 1}`
        : undefined;

      cellNodes.push(
        h(
          cellTag,
          {
            key: `${rowIndex}:${columnIndex}`,
            [DATA_ATTRS.tableCell]: "",
            [DATA_ATTRS.tableCellRow]: rowIndex,
            [DATA_ATTRS.tableCellCol]: columnIndex,
            "data-pen-cell-selected": isSelectedCell ? "" : undefined,
            onMousedown: (event: MouseEvent) => {
              if (readonly || !fieldEditor) {
                return;
              }

              if (
                fieldEditor.activeCellCoord?.blockId === block.id &&
                fieldEditor.activeCellCoord.row === rowIndex &&
                fieldEditor.activeCellCoord.col === columnIndex
              ) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              editor.selectCell(block.id, rowIndex, columnIndex);
            },
            onDblclick: (event: MouseEvent) => {
              if (readonly || !fieldEditor) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();

              const currentTarget = event.currentTarget;
              const cellElement =
                currentTarget instanceof HTMLElement
                  ? (currentTarget.querySelector(
                      `[${DATA_ATTRS.fieldEditorSurface}]`,
                    ) as HTMLElement | null)
                  : null;

              if (cellElement && typeof fieldEditor.activateCellFromElement === "function") {
                fieldEditor.activateCellFromElement(
                  block.id,
                  rowIndex,
                  columnIndex,
                  cellElement,
                );
                return;
              }

              fieldEditor.activateCell?.(block.id, rowIndex, columnIndex);
            },
          },
          [
            h(PenTableCellContent, {
              tableBlockId: block.id,
              row: rowIndex,
              col: columnIndex,
              placeholder,
            }),
          ],
        ),
      );
    }

    bodyRows.push(
      h("tr", { key: `row:${rowIndex}`, "data-pen-table-row": "" }, cellNodes),
    );
  }

  const headerRows = hasHeaderRow && bodyRows.length > 0 ? [bodyRows[0]] : [];
  const dataRows = hasHeaderRow ? bodyRows.slice(1) : bodyRows;
  const tableChildren = [];

  if (headerRows.length > 0) {
    tableChildren.push(h("thead", {}, headerRows));
  }
  tableChildren.push(h("tbody", {}, dataRows));

  return h("div", { "data-block-type": "table" }, [
    h("div", { [DATA_ATTRS.tableFrame]: "" }, [
      h("table", { [DATA_ATTRS.table]: "" }, tableChildren),
    ]),
  ]);
}

function resolveIndent(block: BlockHandle): number {
  return typeof block.props.indent === "number" ? block.props.indent : 0;
}

function clampHeadingLevel(level: unknown): number {
  if (typeof level !== "number") {
    return 1;
  }
  return Math.max(1, Math.min(6, level));
}
