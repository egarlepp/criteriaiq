// Vitest setup.
//
// 1. Initialise i18next with the real locale bundles, exactly as
//    client/src/main.tsx does for the running app. Components converted
//    to t() during the i18n sweep otherwise render raw keys
//    ("audit.loginEventStatus.success") in any test that forgot to
//    import "@/i18n" itself, and every new conversion would silently
//    break the English-copy assertions of its existing tests.
import "./client/src/i18n";

// 2. Silence harmless happy-dom iframe load errors.
//
// The Tiptap Youtube extension renders an <iframe> inside the editor view.
// happy-dom asynchronously dispatches a load/error event on that iframe;
// after the test exits and the window is torn down, the deferred dispatch
// references a null window and throws
// `Cannot read properties of null (reading 'console')`. The throw fires
// outside any test, so it ends up as an unhandled rejection that Vitest
// treats as a test-run failure.
//
// We swallow only that specific message so legitimate failures still surface.
// Vitest registers its own `unhandledRejection` listener; we wrap it.

const originalListeners = process.listeners('unhandledRejection').slice();
process.removeAllListeners('unhandledRejection');

process.on('unhandledRejection', (err: unknown, promise: Promise<unknown>) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("reading 'console'")) return;
  for (const listener of originalListeners) {
    (listener as (e: unknown, p: Promise<unknown>) => void)(err, promise);
  }
});
