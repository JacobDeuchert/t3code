import { DesktopNotificationInputSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as ElectronNotification from "../../electron/ElectronNotification.ts";
import * as DesktopWindow from "../../window/DesktopWindow.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const showNotification = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SHOW_NOTIFICATION_CHANNEL,
  payload: DesktopNotificationInputSchema,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.notifications.show")(function* (input) {
    const notifications = yield* ElectronNotification.ElectronNotification;
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    const context = yield* Effect.context<never>();
    const runPromise = Effect.runPromiseWith(context);

    const onClick = () => {
      void runPromise(
        Effect.gen(function* () {
          const window = yield* desktopWindow.revealOrCreateMain;
          const send = () => {
            if (window.isDestroyed()) return;
            window.webContents.send(IpcChannels.NOTIFICATION_ACTIVATED_CHANNEL, input.threadRef);
          };
          if (!window.webContents.isLoadingMainFrame()) {
            send();
            return;
          }
          yield* Effect.callback<void>((resume) => {
            const sendAfterLoad = () => {
              send();
              resume(Effect.void);
            };
            window.webContents.once("did-finish-load", sendAfterLoad);
            return Effect.sync(() => {
              window.webContents.removeListener("did-finish-load", sendAfterLoad);
            });
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Could not activate a desktop notification.").pipe(
              Effect.annotateLogs({ cause: String(cause) }),
            ),
          ),
        ),
      );
    };

    return yield* notifications
      .show({
        id: input.id,
        title: input.title,
        body: input.body,
        onClick,
      })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not show a desktop notification.").pipe(
            Effect.annotateLogs({ error: error.message }),
            Effect.as(false),
          ),
        ),
      );
  }),
});
