import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.mark-read";
import { getCurrentUserId } from "~/lib/session";
import { markAsRead, getNotifications } from "~/services/notificationService";
import { parseJsonBody } from "~/lib/validation";

const markReadSchema = z.object({
  notificationId: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, markReadSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { notificationId } = parsed.data;

  // Verify the notification belongs to the current user
  const notifications = getNotifications(currentUserId, 100, 0);
  const belongs = notifications.some((n) => n.id === notificationId);

  if (!belongs) {
    throw data("Notification not found", { status: 404 });
  }

  const updated = markAsRead(notificationId);

  return { success: true, notification: updated };
}
