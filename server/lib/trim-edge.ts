/**
 * Removes every leading and trailing `ch` from `value`. A loop rather than
 * `/^-+|-+$/`, whose second branch backtracks quadratically on a long run
 * of `ch` that isn't at the end of user-supplied text.
 */
export function trimEdgeChar(value: string, ch: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === ch) start++;
  while (end > start && value[end - 1] === ch) end--;
  return value.slice(start, end);
}
