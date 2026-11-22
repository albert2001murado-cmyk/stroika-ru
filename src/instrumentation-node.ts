import { startNotificationSchedulers } from "./lib/notification-scheduler";
import { BACKGROUND_INTERVALS, backgroundWorkersEnabled, startBackgroundWorker } from "./lib/background-worker-runtime";

export function registerNodeInstrumentation() {
  if (!backgroundWorkersEnabled()) return;
  startNotificationSchedulers();
  startBackgroundWorker("account-deletion", BACKGROUND_INTERVALS.deletion, 2_000,
    async () => (await import("./lib/account-deletion-server")).runAccountDeletionBatch());
  if (process.env.MODERATION_SCHEDULER_ENABLED !== "true") return;
  startBackgroundWorker("owner-notifications", BACKGROUND_INTERVALS.ownerNotifications, 1_000,
    async () => (await import("./lib/publication-moderation-server")).runPublicationOwnerNotificationJobs());
  startBackgroundWorker("review-moderation", BACKGROUND_INTERVALS.reviews, 5_000,
    async () => (await import("./lib/review-moderation-server")).runReviewModerationBatch(20));
  startBackgroundWorker("avatar-sync", BACKGROUND_INTERVALS.avatars, 10_000,
    async () => (await import("./lib/profile-avatar-sync-server")).runProfileAvatarSyncBatch(10));
  startBackgroundWorker("publication-moderation", BACKGROUND_INTERVALS.publications, 12_000,
    async () => (await import("./lib/publication-moderation-server")).runModerationBatch(30));
}
