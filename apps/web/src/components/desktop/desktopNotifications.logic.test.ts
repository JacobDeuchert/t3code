import { ProviderInstanceId } from "@t3tools/contracts";
import type { EnvironmentId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import {
  createDesktopNotificationTracker,
  projectDesktopAwareness,
  resolveActiveThreadRef,
  scopedThreadKey,
} from "./desktopNotifications.logic";

const NOW = "2026-08-04T12:00:00.000Z";
const environmentId = "env-1" as EnvironmentId;

function thread(state: "running" | "completed" | "approval"): EnvironmentThreadShell {
  const turnId = "turn-1" as TurnId;
  return {
    environmentId,
    id: "thread-1" as ThreadId,
    projectId: "project-1" as ProjectId,
    title: "Fix CI",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: {
      turnId,
      state: state === "completed" ? "completed" : "running",
      requestedAt: NOW,
      startedAt: NOW,
      completedAt: state === "completed" ? NOW : null,
      assistantMessageId: null,
    },
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: {
      threadId: "thread-1" as ThreadId,
      status: state === "completed" ? "ready" : "running",
      providerName: "Codex",
      runtimeMode: "full-access",
      activeTurnId: state === "completed" ? null : turnId,
      lastError: null,
      updatedAt: NOW,
    },
    latestUserMessageAt: NOW,
    hasPendingApprovals: state === "approval",
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

function statesFor(value: EnvironmentThreadShell) {
  const awareness = projectDesktopAwareness(value, "t3code");
  expect(awareness).not.toBeNull();
  return new Map([[scopedThreadKey(value.environmentId, value.id), awareness!]]);
}

describe("desktop notification transitions", () => {
  it("baselines existing completion state and emits only a later transition", () => {
    const tracker = createDesktopNotificationTracker();
    const statuses = new Map([[environmentId, "live" as const]]);

    expect(
      tracker.update({
        statuses,
        states: new Map([[environmentId, statesFor(thread("running"))]]),
      }),
    ).toEqual([]);
    const pending = tracker.update({
      statuses,
      states: new Map([[environmentId, statesFor(thread("completed"))]]),
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: "completed",
      title: "Fix CI",
      body: "Agent finished - t3code",
    });
    expect(
      tracker.update({
        statuses,
        states: new Map([[environmentId, statesFor(thread("completed"))]]),
      }),
    ).toEqual([]);
  });

  it("does not replay a waiting state after reconnect synchronization", () => {
    const tracker = createDesktopNotificationTracker();
    tracker.update({
      statuses: new Map([[environmentId, "live"]]),
      states: new Map([[environmentId, statesFor(thread("running"))]]),
    });
    tracker.update({ statuses: new Map([[environmentId, "synchronizing"]]), states: new Map() });

    expect(
      tracker.update({
        statuses: new Map([[environmentId, "live"]]),
        states: new Map([[environmentId, statesFor(thread("approval"))]]),
      }),
    ).toEqual([]);
  });

  it("keeps no-checkpoint completion identities stable across session updates", () => {
    const first = thread("completed");
    const second = {
      ...first,
      latestTurn: null,
      session: first.session ? { ...first.session, updatedAt: "2026-08-04T12:01:00.000Z" } : null,
    };
    const withoutLatestTurn = { ...first, latestTurn: null };

    expect(projectDesktopAwareness(withoutLatestTurn, "t3code")?.identity).toBe(
      projectDesktopAwareness(second, "t3code")?.identity,
    );
  });

  it("keeps completion identity stable when the latest turn projection lands later", () => {
    const withLatestTurn = thread("completed");
    const withoutLatestTurn = { ...withLatestTurn, latestTurn: null };

    expect(projectDesktopAwareness(withoutLatestTurn, "t3code")?.identity).toBe(
      projectDesktopAwareness(withLatestTurn, "t3code")?.identity,
    );
  });

  it("does not replay completion when an archived thread returns to the shell", () => {
    const tracker = createDesktopNotificationTracker();
    const statuses = new Map([[environmentId, "live" as const]]);
    tracker.update({
      statuses,
      states: new Map([[environmentId, statesFor(thread("running"))]]),
    });
    tracker.update({
      statuses,
      states: new Map([[environmentId, statesFor(thread("completed"))]]),
    });
    tracker.update({ statuses, states: new Map() });

    expect(
      tracker.update({
        statuses,
        states: new Map([[environmentId, statesFor(thread("completed"))]]),
      }),
    ).toEqual([]);
  });

  it("resolves canonical active thread paths", () => {
    expect(resolveActiveThreadRef("/env-1/thread-1")).toEqual({
      environmentId: "env-1",
      threadId: "thread-1",
    });
    expect(resolveActiveThreadRef("/settings/general")).toBeNull();
    expect(resolveActiveThreadRef("/draft/draft-1")).toBeNull();
    expect(resolveActiveThreadRef("/")).toBeNull();
  });
});
