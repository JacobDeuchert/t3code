import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Electron from "electron";
import { vi } from "vite-plus/test";

import * as ElectronNotification from "../../electron/ElectronNotification.ts";
import * as DesktopWindow from "../../window/DesktopWindow.ts";
import { NOTIFICATION_ACTIVATED_CHANNEL } from "../channels.ts";
import { showNotification } from "./notifications.ts";

describe("showNotification", () => {
  it.effect("shows a native notification and routes activation through a recreated window", () =>
    Effect.gen(function* () {
      let resolveActivation!: (value: readonly [string, unknown]) => void;
      const activated = new Promise<readonly [string, unknown]>((resolve) => {
        resolveActivation = resolve;
      });
      const send = vi.fn((channel: string, payload: unknown) => {
        resolveActivation([channel, payload]);
      });
      const window = {
        isDestroyed: () => false,
        webContents: {
          isLoadingMainFrame: () => false,
          send,
        },
      } as unknown as Electron.BrowserWindow;
      const nativeInputs: Array<
        Parameters<ElectronNotification.ElectronNotification["Service"]["show"]>[0]
      > = [];

      const layer = Layer.mergeAll(
        Layer.mock(ElectronNotification.ElectronNotification)({
          show: (input) =>
            Effect.sync(() => {
              nativeInputs.push(input);
              return true;
            }),
        }),
        Layer.mock(DesktopWindow.DesktopWindow)({
          revealOrCreateMain: Effect.succeed(window),
        }),
      );

      const result = yield* showNotification
        .handler({
          id: "env-1:thread-1:turn-1",
          kind: "completed",
          title: "Fix CI",
          body: "Agent finished - t3code",
          threadRef: { environmentId: "env-1", threadId: "thread-1" },
        })
        .pipe(Effect.provide(layer));

      assert.isTrue(result);
      nativeInputs[0]!.onClick();
      assert.deepEqual(yield* Effect.promise(() => activated), [
        NOTIFICATION_ACTIVATED_CHANNEL,
        { environmentId: "env-1", threadId: "thread-1" },
      ]);
    }),
  );
});
