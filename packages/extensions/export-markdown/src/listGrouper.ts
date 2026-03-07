/**
 * Groups consecutive list item lines into markdown lists.
 * Consecutive list items at the same indent level are joined with
 * single newlines instead of double newlines, producing correct
 * markdown list output.
 */
export function groupListItems(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isListLine(line)) {
      const group: string[] = [line];
      i++;
      while (i < lines.length && isListLine(lines[i])) {
        group.push(lines[i]);
        i++;
      }
      result.push(group.join("\n"));
    } else {
      result.push(line);
      i++;
    }
  }

  return result;
}

const LIST_PREFIX = /^\s*(?:[-*+]|\d+\.)\s/;

function isListLine(line: string): boolean {
  return LIST_PREFIX.test(line);
}
