import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DiffFileTree } from "./DiffFileTree";

describe("DiffFileTree", () => {
  it("renders compact folders, change states, and the selected file", () => {
    const markup = renderToStaticMarkup(
      <DiffFileTree
        files={[
          {
            path: "apps/web/src/App.tsx",
            kind: "modified",
            additions: 4,
            deletions: 2,
          },
          {
            path: "apps/web/src/new.ts",
            kind: "added",
            additions: 3,
            deletions: 0,
          },
        ]}
        selectedPath="apps/web/src/App.tsx"
        showStats
        resolvedTheme="light"
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain("Changes");
    expect(markup).toContain("All changes");
    expect(markup).toContain("apps/web/src");
    expect(markup).toContain("App.tsx");
    expect(markup).toContain("new.ts");
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain(">M<");
    expect(markup).toContain(">A<");
  });
});
