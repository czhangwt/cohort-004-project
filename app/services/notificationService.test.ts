import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { users, notifications, UserRole, NotificationType } from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("creates a notification with all fields", () => {
      const notification = createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "New Enrollment",
        "John Doe enrolled in Test Course",
        "/instructor/1/students"
      );

      expect(notification).toBeDefined();
      expect(notification.recipientUserId).toBe(base.instructor.id);
      expect(notification.type).toBe(NotificationType.Enrollment);
      expect(notification.title).toBe("New Enrollment");
      expect(notification.message).toBe("John Doe enrolled in Test Course");
      expect(notification.linkUrl).toBe("/instructor/1/students");
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });
  });

  describe("getNotifications", () => {
    it("returns notifications ordered by newest first", () => {
      // Use explicit timestamps to guarantee ordering
      testDb
        .insert(notifications)
        .values({
          recipientUserId: base.instructor.id,
          type: NotificationType.Enrollment,
          title: "Older",
          message: "Older notification",
          linkUrl: "/instructor/1/students",
          createdAt: "2025-01-01T00:00:00.000Z",
        })
        .returning()
        .get();

      const newer = testDb
        .insert(notifications)
        .values({
          recipientUserId: base.instructor.id,
          type: NotificationType.Enrollment,
          title: "Newer",
          message: "Newer notification",
          linkUrl: "/instructor/1/students",
          createdAt: "2025-06-01T00:00:00.000Z",
        })
        .returning()
        .get();

      const results = getNotifications(base.instructor.id, 10, 0);
      expect(results).toHaveLength(2);
      // Newest first
      expect(results[0].id).toBe(newer.id);
      expect(results[0].title).toBe("Newer");
      expect(results[1].id).toBe(newer.id - 1);
      expect(results[1].title).toBe("Older");
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        createNotification(
          base.instructor.id,
          NotificationType.Enrollment,
          `Title ${i}`,
          `Message ${i}`,
          "/instructor/1/students"
        );
      }

      const results = getNotifications(base.instructor.id, 3, 0);
      expect(results).toHaveLength(3);
    });

    it("respects offset", () => {
      for (let i = 0; i < 5; i++) {
        createNotification(
          base.instructor.id,
          NotificationType.Enrollment,
          `Title ${i}`,
          `Message ${i}`,
          "/instructor/1/students"
        );
      }

      const all = getNotifications(base.instructor.id, 10, 0);
      const paged = getNotifications(base.instructor.id, 10, 3);
      expect(paged).toHaveLength(2);
      expect(paged[0].id).toBe(all[3].id);
    });

    it("returns empty array when user has no notifications", () => {
      expect(getNotifications(base.instructor.id, 10, 0)).toHaveLength(0);
    });
  });

  describe("getUnreadCount", () => {
    it("returns count of unread notifications", () => {
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 1",
        "Message 1",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 2",
        "Message 2",
        "/instructor/1/students"
      );

      expect(getUnreadCount(base.instructor.id)).toBe(2);
    });

    it("excludes read notifications from count", () => {
      const n1 = createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 1",
        "Message 1",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 2",
        "Message 2",
        "/instructor/1/students"
      );

      markAsRead(n1.id);

      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });

    it("returns 0 when user has no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("marks a single notification as read", () => {
      const notification = createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title",
        "Message",
        "/instructor/1/students"
      );

      const updated = markAsRead(notification.id);
      expect(updated).toBeDefined();
      expect(updated!.isRead).toBe(true);
    });

    it("returns undefined for non-existent notification", () => {
      expect(markAsRead(9999)).toBeUndefined();
    });
  });

  describe("markAllAsRead", () => {
    it("marks all unread notifications as read for a user", () => {
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 1",
        "Message 1",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 2",
        "Message 2",
        "/instructor/1/students"
      );

      const updated = markAllAsRead(base.instructor.id);
      expect(updated).toHaveLength(2);
      expect(updated.every((n) => n.isRead)).toBe(true);
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("does not affect already-read notifications", () => {
      const n1 = createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title 1",
        "Message 1",
        "/instructor/1/students"
      );

      markAsRead(n1.id);

      const updated = markAllAsRead(base.instructor.id);
      // Already-read notifications are not returned (only unread ones were updated)
      expect(updated).toHaveLength(0);
    });
  });

  describe("user scoping", () => {
    it("only returns notifications for the specified user", () => {
      const otherInstructor = testDb
        .insert(users)
        .values({
          name: "Other Instructor",
          email: "other-instr@example.com",
          role: UserRole.Instructor,
        })
        .returning()
        .get();

      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "For base instructor",
        "Message",
        "/instructor/1/students"
      );

      const otherNotifications = getNotifications(otherInstructor.id, 10, 0);
      expect(otherNotifications).toHaveLength(0);

      const baseNotifications = getNotifications(base.instructor.id, 10, 0);
      expect(baseNotifications).toHaveLength(1);
    });

    it("getUnreadCount is scoped to user", () => {
      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "Title",
        "Message",
        "/instructor/1/students"
      );

      expect(getUnreadCount(base.user.id)).toBe(0);
      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });

    it("markAllAsRead is scoped to user", () => {
      const otherInstructor = testDb
        .insert(users)
        .values({
          name: "Other Instructor",
          email: "other-instr2@example.com",
          role: UserRole.Instructor,
        })
        .returning()
        .get();

      createNotification(
        base.instructor.id,
        NotificationType.Enrollment,
        "For base",
        "Message",
        "/instructor/1/students"
      );
      createNotification(
        otherInstructor.id,
        NotificationType.Enrollment,
        "For other",
        "Message",
        "/instructor/1/students"
      );

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
      expect(getUnreadCount(otherInstructor.id)).toBe(1);
    });
  });
});
