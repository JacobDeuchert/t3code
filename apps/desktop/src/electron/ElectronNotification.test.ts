import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { beforeEach, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const isSupported = vi.fn(() => true);
  const once = vi.fn();
  const show = vi.fn();
  const Notification = vi.fn(function NotificationMock() {
    return { once, show };
  });
  return { isSupported, once, show, Notification };
});

vi.mock("electron", () => ({
  Notification: Object.assign(mocks.Notification, { isSupported: mocks.isSupported }),
}));

import * as ElectronNotification from "./ElectronNotification.ts";

describe("ElectronNotification", () => {
  beforeEach(() => {
    mocks.isSupported.mockReset().mockReturnValue(true);
    mocks.once.mockReset();
    mocks.show.mockReset();
    mocks.Notification.mockClear();
  });

  it.effect("shows a silent native notification and deduplicates its identity", () =>
    Effect.gen(function* () {
      const notifications = yield* ElectronNotification.ElectronNotification;
      const input = {
        id: "env-1:thread-1:turn-1",
        title: "Fix CI",
        body: "Agent finished - t3code",
        onClick: vi.fn(),
      };

      assert.isTrue(yield* notifications.show(input));
      assert.isFalse(yield* notifications.show(input));
      assert.deepEqual(mocks.Notification.mock.calls, [
        [{ title: input.title, body: input.body, silent: true }],
      ]);
      assert.equal(mocks.show.mock.calls.length, 1);
    }).pipe(Effect.provide(ElectronNotification.layer)),
  );

  it.effect("reports unsupported notification presenters without constructing one", () => {
    mocks.isSupported.mockReturnValue(false);
    return Effect.gen(function* () {
      const notifications = yield* ElectronNotification.ElectronNotification;
      assert.isFalse(
        yield* notifications.show({
          id: "unsupported",
          title: "Agent finished",
          body: "Done",
          onClick: vi.fn(),
        }),
      );
      assert.equal(mocks.Notification.mock.calls.length, 0);
    }).pipe(Effect.provide(ElectronNotification.layer));
  });

  it.effect("forwards native click activation", () =>
    Effect.gen(function* () {
      const onClick = vi.fn();
      const notifications = yield* ElectronNotification.ElectronNotification;
      yield* notifications.show({ id: "click", title: "Needs input", body: "Open", onClick });

      const click = mocks.once.mock.calls.find(([event]) => event === "click")?.[1];
      assert.isFunction(click);
      click();
      assert.equal(onClick.mock.calls.length, 1);
    }).pipe(Effect.provide(ElectronNotification.layer)),
  );
});
