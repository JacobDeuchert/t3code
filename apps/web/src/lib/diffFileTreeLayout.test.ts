import { describe, expect, it } from "vite-plus/test";

import {
  DIFF_FILE_TREE_MAX_WIDTH,
  DIFF_FILE_TREE_MIN_WIDTH,
  getDiffFileTreeMaxWidth,
} from "./diffFileTreeLayout";

describe("getDiffFileTreeMaxWidth", () => {
  it("uses forty percent of the diff surface within its bounds", () => {
    expect(getDiffFileTreeMaxWidth(600)).toBe(240);
    expect(getDiffFileTreeMaxWidth(800)).toBe(320);
  });

  it("preserves a usable minimum and bounded maximum", () => {
    expect(getDiffFileTreeMaxWidth(300)).toBe(DIFF_FILE_TREE_MIN_WIDTH);
    expect(getDiffFileTreeMaxWidth(1200)).toBe(DIFF_FILE_TREE_MAX_WIDTH);
    expect(getDiffFileTreeMaxWidth(Number.NaN)).toBe(DIFF_FILE_TREE_MAX_WIDTH);
  });
});
