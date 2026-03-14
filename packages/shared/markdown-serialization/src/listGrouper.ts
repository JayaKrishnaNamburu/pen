/**
 * Groups consecutive list item lines into markdown lists.
 * Consecutive list items at the same indent level are joined with
 * single newlines instead of double newlines, producing correct
 * markdown list output.
 */
export function groupListItems(lines: string[]): string[] {
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isListLine(line)) {
      const group: string[] = [line];
      index++;
      while (index < lines.length && isListLine(lines[index])) {
        group.push(lines[index]);
        index++;
      }
      result.push(group.join("\n"));
      continue;
    }

    result.push(line);
    index++;
  }

  return result;
}

const LIST_PREFIX = /^\s*(?:[-*+]|\d+\.)\s/;

function isListLine(line: string): boolean {
  return LIST_PREFIX.test(line);
}
