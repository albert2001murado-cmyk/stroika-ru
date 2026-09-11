declare global {
  // Один таймер на процесс, в том числе при hot reload в разработке.
  var __stroikaModerationTimer: ReturnType<typeof setInterval> | undefined;
  var __stroikaModerationRunning: boolean | undefined;
}

export function registerNodeInstrumentation() {
  if (
    process.env.MODERATION_SCHEDULER_ENABLED !== "true" ||
    globalThis.__stroikaModerationTimer
  ) {
    return;
  }

  const tick = async () => {
    if (globalThis.__stroikaModerationRunning) return;
    globalThis.__stroikaModerationRunning = true;

    try {
      const { runModerationBatch } = await import(
        "@/lib/publication-moderation-server"
      );
      await runModerationBatch(30);
    } catch (error) {
      console.error("scheduled publication moderation failed", error);
    } finally {
      globalThis.__stroikaModerationRunning = false;
    }
  };

  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
  globalThis.__stroikaModerationTimer = timer;
  setTimeout(() => void tick(), 10_000).unref?.();
}
