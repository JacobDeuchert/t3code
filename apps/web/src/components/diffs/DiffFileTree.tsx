import { ChevronRightIcon, FilesIcon, FolderClosedIcon, FolderOpenIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { buildTurnDiffTree, type TurnDiffTreeNode } from "../../lib/turnDiffTree";
import { cn } from "~/lib/utils";
import { DiffStatLabel } from "../chat/DiffStatLabel";
import { PierreEntryIcon } from "../chat/PierreEntryIcon";

export interface DiffFileTreeEntry {
  path: string;
  kind: "added" | "deleted" | "modified" | "renamed";
  additions: number;
  deletions: number;
}

const CHANGE_LABELS = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
} as const;

const CHANGE_LABEL_CLASS_NAMES = {
  added: "text-success",
  deleted: "text-destructive",
  modified: "text-amber-500 dark:text-amber-400",
  renamed: "text-blue-500 dark:text-blue-400",
} as const;

export function DiffFileTree(props: {
  files: ReadonlyArray<DiffFileTreeEntry>;
  selectedPath: string | null;
  showStats: boolean;
  resolvedTheme: "light" | "dark";
  onSelect: (path: string | null) => void;
}) {
  const { files, onSelect, resolvedTheme, selectedPath, showStats } = props;
  const treeNodes = useMemo(() => buildTurnDiffTree(files), [files]);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleDirectory = useCallback((path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const paddingLeft = 8 + depth * 12;
    if (node.kind === "directory") {
      const expanded = !collapsedDirectories.has(node.path);
      return (
        <div key={`directory:${node.path}`}>
          <button
            type="button"
            className="group flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            style={{ paddingLeft }}
            aria-expanded={expanded}
            onClick={() => toggleDirectory(node.path)}
          >
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90",
              )}
            />
            {expanded ? (
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {expanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    const file = fileByPath.get(node.path);
    if (!file) return null;
    const selected = selectedPath === node.path;
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        title={node.path}
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft }}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(node.path)}
      >
        <span className="size-3 shrink-0" />
        <PierreEntryIcon
          pathValue={node.path}
          kind="file"
          theme={resolvedTheme}
          className="size-3.5"
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {showStats ? (
          <DiffStatLabel
            additions={file.additions}
            deletions={file.deletions}
            className="shrink-0 text-[10px]"
          />
        ) : null}
        <span
          className={cn(
            "w-3 shrink-0 text-right font-mono text-[10px] font-semibold",
            CHANGE_LABEL_CLASS_NAMES[file.kind],
          )}
        >
          {CHANGE_LABELS[file.kind]}
        </span>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/30">
      <div className="flex h-8 shrink-0 items-center border-b border-border/70 px-2 text-[11px] font-medium text-muted-foreground">
        <span>Changes</span>
        <span className="ml-auto tabular-nums">{files.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <button
          type="button"
          className={cn(
            "flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            selectedPath === null && "bg-accent text-accent-foreground",
          )}
          aria-current={selectedPath === null ? "true" : undefined}
          onClick={() => onSelect(null)}
        >
          <FilesIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">All changes</span>
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {files.length}
          </span>
        </button>
        {treeNodes.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}
