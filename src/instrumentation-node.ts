declare global {
  // Один таймер на процесс, в том числе при hot reload в разработке.
  var __stroikaModerationTimer: ReturnType<typeof setInterval> | undefined;
  var __stroikaModerationRunning: boolean | undefined;
  var __stroikaOwnerNotificationTimer: ReturnType<typeof setInterval> | undefined;
  var __stroikaOwnerNotificationRunning: boolean | undefined;
}

export function registerNodeInstrumentation() {
  if (process.env.MODERATION_SCHEDULER_ENABLED !== "true" || process.env.NEXT_PHASE === "phase-production-build") return;

  if (!globalThis.__stroikaOwnerNotificationTimer) {
    const notify = async () => {
      if (globalThis.__stroikaOwnerNotificationRunning) return;
      globalThis.__stroikaOwnerNotificationRunning = true;
      try {
        const { runPublicationOwnerNotificationJobs } = await import("@/lib/publication-moderation-server");
        await runPublicationOwnerNotificationJobs();
      } catch {
        console.error("scheduled owner notification recovery will retry");
      } finally {
        globalThis.__stroikaOwnerNotificationRunning = false;
      }
    };
    const timer = setInterval(() => void notify(), 5_000);
    timer.unref?.();
    globalThis.__stroikaOwnerNotificationTimer = timer;
    setTimeout(() => void notify(), 1_000).unref?.();
  }

  if (globalThis.__stroikaModerationTimer) return;

  const tick = async () => {
    if (globalThis.__stroikaModerationRunning) return;
    globalThis.__stroikaModerationRunning = true;

    try {
      const { runProfileAvatarSyncBatch } = await import("@/lib/profile-avatar-sync-server");
      await runProfileAvatarSyncBatch(10).catch(error => {
        console.error("scheduled avatar sync failed", error);
      });
      const { runReviewModerationBatch } = await import("@/lib/review-moderation-server");
      await runReviewModerationBatch(20).catch(() => {
        console.error("scheduled review moderation will retry");
      });
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
