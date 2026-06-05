import { eq, and, or } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Handles lesson bookmarking: toggle, check, and batch query.
// Uses positional parameters (project convention).

export function toggleBookmark(userId: number, lessonId: number) {
  const existing = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();

  if (existing) {
    db.delete(lessonBookmarks).where(eq(lessonBookmarks.id, existing.id)).run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks)
    .values({ userId, lessonId })
    .run();
  return { bookmarked: true };
}

export function isLessonBookmarked(userId: number, lessonId: number) {
  const result = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();
  return result !== undefined;
}

export function getBookmarkedLessonIds(userId: number, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .all();

  if (courseLessons.length === 0) return [];

  const lessonIds = courseLessons.map((l) => l.id);

  const bookmarks = db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        or(...lessonIds.map((id) => eq(lessonBookmarks.lessonId, id)))!
      )
    )
    .all();

  return bookmarks.map((b) => b.lessonId);
}
