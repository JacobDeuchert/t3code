export const DIFF_FILE_TREE_DEFAULT_WIDTH = 240;
export const DIFF_FILE_TREE_MIN_WIDTH = 160;
export const DIFF_FILE_TREE_MAX_WIDTH = 360;
export const DIFF_FILE_TREE_MAX_WIDTH_FRACTION = 0.4;
export const DIFF_FILE_TREE_STATS_MIN_WIDTH = 220;

export function getDiffFileTreeMaxWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return DIFF_FILE_TREE_MAX_WIDTH;
  }
  return Math.max(
    DIFF_FILE_TREE_MIN_WIDTH,
    Math.min(
      DIFF_FILE_TREE_MAX_WIDTH,
      Math.floor(containerWidth * DIFF_FILE_TREE_MAX_WIDTH_FRACTION),
    ),
  );
}
