import { useState, useRef, useEffect } from "react";
import type { Editor, BlockDisplay } from "@pen/core";

export interface SlashMenuState {
  open: boolean;
  query: string;
  items: Array<{ type: string; display: BlockDisplay }>;
  selectedIndex: number;
}

export interface SlashMenuActions {
  setQuery: (q: string) => void;
  select: (index: number) => void;
  confirm: () => void;
  dismiss: () => void;
}

export function useSlashMenu(
  editor: Editor,
): SlashMenuState & SlashMenuActions {
  const [state, setState] = useState<SlashMenuState>({
    open: false,
    query: "",
    items: [],
    selectedIndex: 0,
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const allDisplays = editor.schema.allBlockDisplays();
  const allDisplaysRef = useRef(allDisplays);
  allDisplaysRef.current = allDisplays;

  useEffect(() => {
    const unsub = editor.on("documentChange", () => {
      const selection = editorRef.current.selection;
      if (!selection || selection.type !== "text") return;

      const blockId = selection.anchor.blockId;
      const block = editorRef.current.getBlock(blockId);
      if (!block) return;

      const text = block.textContent();
      if (text === "/") {
        const items = filterItems(allDisplaysRef.current, "");
        setState({
          open: true,
          query: "",
          items,
          selectedIndex: 0,
        });
      }
    });
    return unsub;
  }, [editor]);

  const setQuery = (query: string) => {
    const filtered = filterItems(allDisplays, query);
    setState((prev) => ({
      ...prev,
      query,
      items: filtered,
      selectedIndex: 0,
    }));
  };

  const select = (index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: Math.max(0, Math.min(index, prev.items.length - 1)),
    }));
  };

  const confirm = () => {
    const item = state.items[state.selectedIndex];
    if (!item) return;

    const ed = editorRef.current;
    const selection = ed.selection;

    if (selection?.type === "text") {
      const blockId = selection.anchor.blockId;
      const block = ed.getBlock(blockId);

      if (block) {
        const currentText = block.textContent();
        const isEmptyOrSlash = !currentText || currentText === "/" || currentText === "\u200B";

        if (isEmptyOrSlash && block.type !== item.type) {
          if (currentText === "/") {
            const adapter = ed.internals.adapter;
            const doc = ed.internals.crdtDoc;
            const ydoc = adapter.raw(doc) as any;
            const blockMap = ydoc.getMap("blocks").get(blockId);
            const ytext = blockMap?.get("content");
            if (ytext) {
              adapter.transact(doc, () => {
                ytext.delete(0, ytext.length);
                ytext.insert(0, "\u200B");
              }, "user");
            }
          }

          ed.apply([
            {
              type: "convert-block",
              blockId,
              newType: item.type,
            },
          ]);
        } else {
          const newBlockId = crypto.randomUUID();
          ed.apply([
            {
              type: "insert-block",
              blockId: newBlockId,
              blockType: item.type,
              props: {},
              position: { after: blockId },
            },
          ]);
        }
      }
    }

    setState({ open: false, query: "", items: [], selectedIndex: 0 });
  };

  const dismiss = () => {
    setState({ open: false, query: "", items: [], selectedIndex: 0 });
  };

  return { ...state, setQuery, select, confirm, dismiss };
}

function filterItems(
  displays: readonly (import("@pen/core").BlockSchema & {
    display: BlockDisplay;
  })[],
  query: string,
): Array<{ type: string; display: BlockDisplay }> {
  if (!query) {
    return displays.map((d) => ({ type: d.type, display: d.display }));
  }

  const lower = query.toLowerCase();
  return displays
    .filter((d) => {
      const title = d.display.title.toLowerCase();
      const desc = d.display.description?.toLowerCase() ?? "";
      const aliases = d.display.aliases ?? [];
      return (
        title.includes(lower) ||
        desc.includes(lower) ||
        aliases.some((a) => a.toLowerCase().includes(lower))
      );
    })
    .sort((a: (typeof displays)[number], b: (typeof displays)[number]) => {
      const aPos = a.display.title.toLowerCase().indexOf(lower);
      const bPos = b.display.title.toLowerCase().indexOf(lower);
      return aPos - bPos;
    })
    .map((d) => ({ type: d.type, display: d.display }));
}
