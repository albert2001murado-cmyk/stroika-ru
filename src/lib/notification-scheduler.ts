import { BACKGROUND_INTERVALS, startBackgroundWorker } from "./background-worker-runtime";

export function startNotificationSchedulers() {
  startBackgroundWorker("push", BACKGROUND_INTERVALS.push, 5_000,
    async () => (await import("./notification-push-server")).runNotificationPushBatch());
  startBackgroundWorker("moderator", BACKGROUND_INTERVALS.moderator, 8_000,
    async () => (await import("./moderator-notifications-server")).runModeratorNotificationBatch());
  startBackgroundWorker("recommendations", BACKGROUND_INTERVALS.recommendations, 30_000,
    async () => (await import("./engagement-server")).runEngagementJob());
}
