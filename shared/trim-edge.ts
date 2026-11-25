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

/**
 * Removes every trailing `ch` from `value` ("https://x.io//" → "https://x.io"
 * for "/"). A loop rather than `/\/+$/`, which backtracks quadratically on a
 * long run of `ch` that isn't at the end of user-supplied text.
 */
export function trimTrailingChar(value: string, ch: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === ch) end--;
  return value.slice(0, end);
}
