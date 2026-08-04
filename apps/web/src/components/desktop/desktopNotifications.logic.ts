import type {
  EnvironmentShellStatus,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type {
  DesktopNotificationInput,
  DesktopNotificationKind,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { projectThreadAwareness, type AgentAwarenessPhase } from "@t3tools/shared/agentAwareness";

const TARGET_PHASES = new Set<AgentAwarenessPhase>([
  "completed",
  "failed",
  "waiting_for_approval",
  "waiting_for_input",
]);

export interface DesktopAwarenessState {
  readonly phase: AgentAwarenessPhase;
  readonly identity: string;
  readonly notification: DesktopNotificationInput | null;
}

export interface DesktopNotificationTracker {
  readonly update: (input: {
    readonly statuses: ReadonlyMap<EnvironmentId, EnvironmentShellStatus>;
    readonly states: ReadonlyMap<EnvironmentId, ReadonlyMap<string, DesktopAwarenessState>>;
  }) => readonly DesktopNotificationInput[];
}

export function createDesktopNotificationTracker(): DesktopNotificationTracker {
  const previous = new Map<string, DesktopAwarenessState>();
  const liveEnvironments = new Set<EnvironmentId>();

  return {
    update: ({ statuses, states }) => {
      for (const environmentId of liveEnvironments) {
        if (statuses.get(environmentId) === "live") continue;
        liveEnvironments.delete(environmentId);
        for (const key of previous.keys()) {
          if (key.startsWith(`${environmentId}\0`)) previous.delete(key);
        }
      }

      const pending: DesktopNotificationInput[] = [];
      for (const [environmentId, status] of statuses) {
        if (status !== "live") continue;
        const currentStates = states.get(environmentId) ?? new Map<string, DesktopAwarenessState>();
        const isBaseline = !liveEnvironments.has(environmentId);

        for (const [key, current] of currentStates) {
          const prior = previous.get(key);
          previous.set(key, current);
          if (
            !isBaseline &&
            shouldNotifyTransition(prior, current) &&
            current.notification !== null
          ) {
            pending.push(current.notification);
          }
        }
        liveEnvironments.add(environmentId);
      }
      return pending;
    },
  };
}

export function scopedThreadKey(
  environmentId: EnvironmentId,
  threadId: ScopedThreadRef["threadId"],
): string {
  return `${environmentId}\0${threadId}`;
}

export function resolveActiveThreadRef(pathname: string): ScopedThreadRef | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  if (
    segments[0] === "draft" ||
    segments[0] === "settings" ||
    segments[0] === "connect" ||
    segments[0] === "connect_" ||
    segments[0] === "pair"
  )
    return null;
  try {
    return {
      environmentId: decodeURIComponent(segments[0]!) as EnvironmentId,
      threadId: decodeURIComponent(segments[1]!) as ScopedThreadRef["threadId"],
    };
  } catch {
    return null;
  }
}

export function projectDesktopAwareness(
  thread: EnvironmentThreadShell,
  projectTitle: string,
): DesktopAwarenessState | null {
  const awareness = projectThreadAwareness({
    environmentId: thread.environmentId,
    project: { title: projectTitle },
    thread,
  });
  if (awareness === null) return null;

  const generation = thread.latestUserMessageAt ?? thread.createdAt;
  const identity = `${awareness.phase}\0${generation}`;
  if (!TARGET_PHASES.has(awareness.phase)) {
    return { phase: awareness.phase, identity, notification: null };
  }

  const kind = awareness.phase as DesktopNotificationKind;
  return {
    phase: awareness.phase,
    identity,
    notification: {
      id: `${scopedThreadKey(thread.environmentId, thread.id)}\0${identity}`,
      kind,
      title: thread.title.slice(0, 120),
      body: `${awareness.headline} - ${projectTitle}`.slice(0, 240),
      threadRef: {
        environmentId: thread.environmentId,
        threadId: thread.id,
      },
    },
  };
}

export function shouldNotifyTransition(
  previous: DesktopAwarenessState | undefined,
  current: DesktopAwarenessState,
): boolean {
  return (
    current.notification !== null &&
    (previous === undefined ||
      previous.phase !== current.phase ||
      previous.identity !== current.identity)
  );
}
