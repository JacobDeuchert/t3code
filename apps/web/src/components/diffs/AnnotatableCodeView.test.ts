import type { CodeViewItem, SelectedLineRange } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

import { resolveCodeViewLineSelection } from "./AnnotatableCodeView";

describe("resolveCodeViewLineSelection", () => {
  it("targets the owning CodeView item for a gutter selection", () => {
    const range: SelectedLineRange = { start: 26, end: 26, side: "additions" };
    const item = { id: "flake.lock", type: "diff" } as CodeViewItem<never>;

    expect(resolveCodeViewLineSelection(range, { item })).toEqual({
      id: "flake.lock",
      range,
    });
    expect(resolveCodeViewLineSelection(null, { item })).toBeNull();
  });
});
