import type { EnvironmentId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useClientSettings, useClientSettingsHydrated } from "../../hooks/useSettings";
import { useEnvironmentShellStatuses, useProjects, useThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { playDesktopNotificationSound } from "./desktopNotificationSound";
import {
  projectDesktopAwareness,
  createDesktopNotificationTracker,
  resolveActiveThreadRef,
  scopedThreadKey,
  type DesktopAwarenessState,
  type DesktopNotificationTracker,
} from "./desktopNotifications.logic";

export function DesktopNotificationCoordinator() {
  const bridge = window.desktopBridge?.notifications;
  const settingsHydrated = useClientSettingsHydrated();
  const notificationsEnabled = useClientSettings(
    (settings) => settings.desktopNotificationsEnabled,
  );
  const soundsEnabled = useClientSettings((settings) => settings.desktopNotificationSoundsEnabled);
  const projects = useProjects();
  const threads = useThreadShells();
  const shellStatuses = useEnvironmentShellStatuses();
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeDraftSession = useComposerDraftStore((store) => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "draft") return null;
    try {
      return store.getDraftSession(DraftId.make(decodeURIComponent(segments[1]!)));
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();
  const trackerRef = useRef<DesktopNotificationTracker | null>(null);
  const tracker = trackerRef.current ?? (trackerRef.current = createDesktopNotificationTracker());

  useEffect(() => {
    if (!bridge) return;
    return bridge.onActivated((threadRef) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    });
  }, [bridge, navigate]);

  useEffect(() => {
    if (!bridge || !settingsHydrated) return;

    const projectsByKey = new Map(
      projects.map((project) => [`${project.environmentId}\0${project.id}`, project.title]),
    );
    const states = new Map<EnvironmentId, Map<string, DesktopAwarenessState>>();
    for (const thread of threads) {
      const state = projectDesktopAwareness(
        thread,
        projectsByKey.get(`${thread.environmentId}\0${thread.projectId}`) ?? "Project",
      );
      if (state === null) continue;
      const environmentStates =
        states.get(thread.environmentId) ?? new Map<string, DesktopAwarenessState>();
      environmentStates.set(scopedThreadKey(thread.environmentId, thread.id), state);
      states.set(thread.environmentId, environmentStates);
    }
    const pending = tracker.update({ statuses: shellStatuses, states });
    if (pending.length === 0) return;

    if (soundsEnabled) {
      playDesktopNotificationSound(
        pending.some((notification) => notification.kind !== "completed")
          ? "attention"
          : "complete",
      );
    }
    if (!notificationsEnabled) return;

    const activeThread =
      resolveActiveThreadRef(pathname) ??
      (activeDraftSession
        ? scopeThreadRef(activeDraftSession.environmentId, activeDraftSession.threadId)
        : null);
    const userIsFocused = document.visibilityState === "visible" && document.hasFocus();
    for (const notification of pending) {
      const isActiveThread =
        userIsFocused &&
        activeThread?.environmentId === notification.threadRef.environmentId &&
        activeThread.threadId === notification.threadRef.threadId;
      if (isActiveThread) continue;
      void bridge.show(notification).catch((error) => {
        console.error("[DESKTOP_NOTIFICATIONS] native delivery failed", {
          ...safeErrorLogAttributes(error),
        });
      });
    }
  }, [
    bridge,
    activeDraftSession,
    notificationsEnabled,
    pathname,
    projects,
    settingsHydrated,
    shellStatuses,
    soundsEnabled,
    threads,
    tracker,
  ]);

  return null;
}
