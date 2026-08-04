import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

const MAX_REMEMBERED_NOTIFICATION_IDS = 512;
const MAX_ACTIVE_NOTIFICATION_REFS = 512;

export class ElectronNotificationError extends Schema.TaggedErrorClass<ElectronNotificationError>()(
  "ElectronNotificationError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to show an Electron notification.";
  }
}

export class ElectronNotification extends Context.Service<
  ElectronNotification,
  {
    readonly show: (input: {
      readonly id: string;
      readonly title: string;
      readonly body: string;
      readonly onClick: () => void;
    }) => Effect.Effect<boolean, ElectronNotificationError>;
  }
>()("@t3tools/desktop/electron/ElectronNotification") {}

export const make = Effect.sync(() => {
  const active = new Set<Electron.Notification>();
  const rememberedIds = new Set<string>();

  return ElectronNotification.of({
    show: (input) =>
      Effect.try({
        try: () => {
          if (!Electron.Notification.isSupported() || rememberedIds.has(input.id)) return false;

          const notification = new Electron.Notification({
            title: input.title,
            body: input.body,
            silent: true,
          });
          const release = () => active.delete(notification);
          notification.once("click", () => {
            release();
            input.onClick();
          });
          notification.once("close", release);
          notification.once("failed", release);

          active.add(notification);
          if (active.size > MAX_ACTIVE_NOTIFICATION_REFS) {
            const oldest = active.values().next().value;
            if (oldest !== undefined) active.delete(oldest);
          }
          try {
            notification.show();
          } catch (error) {
            release();
            throw error;
          }
          rememberedIds.add(input.id);
          if (rememberedIds.size > MAX_REMEMBERED_NOTIFICATION_IDS) {
            const oldest = rememberedIds.values().next().value;
            if (oldest !== undefined) rememberedIds.delete(oldest);
          }
          return true;
        },
        catch: (cause) => new ElectronNotificationError({ cause }),
      }),
  });
});

export const layer = Layer.effect(ElectronNotification, make);
