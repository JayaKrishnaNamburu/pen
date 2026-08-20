/**
 * HOST4: `replaceChildren` is not guaranteed on every host near the floor.
 * Clearing then appending is equivalent — inactive inline/cell content still
 * empties; no user-visible degradation.
 */
export function replaceElementChildren(
  element: ParentNode,
  ...nodes: (Node | string)[]
): void {
  if (typeof element.replaceChildren === "function") {
    element.replaceChildren(...nodes);
    return;
  }

  while (element.firstChild) {
    element.firstChild.remove();
  }
  if (nodes.length > 0) {
    element.append(...nodes);
  }
}
