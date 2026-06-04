import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";

// ─── Review Service ───
// Handles star rating reviews for courses.
// One review per user per course — upsert pattern.
// Uses positional parameters (project convention).

export function upsertReview(
  userId: number,
  courseId: number,
  rating: number
) {
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const existing = db
    .select()
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      )
    )
    .get();

  if (existing) {
    return db
      .update(courseReviews)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseReviews.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseReviews)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

export function getUserRating(userId: number, courseId: number) {
  return db
    .select()
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      )
    )
    .get() ?? null;
}

export function getAverageRating(courseId: number) {
  const result = db
    .select({
      average: sql<number>`ROUND(AVG(${courseReviews.rating}), 1)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getAverageRatingsForCourses(courseIds: number[]) {
  if (courseIds.length === 0) return {} as Record<number, { average: number; count: number }>;

  const rows = db
    .select({
      courseId: courseReviews.courseId,
      average: sql<number>`ROUND(AVG(${courseReviews.rating}), 1)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  const result: Record<number, { average: number; count: number }> = {};
  for (const row of rows) {
    result[row.courseId] = { average: row.average, count: row.count };
  }
  return result;
}

export function getReviewCountForCourse(courseId: number) {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return result?.count ?? 0;
}
