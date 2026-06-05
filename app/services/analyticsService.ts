import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, purchases, enrollments, courseRatings } from "~/db/schema";

// ─── Analytics Service ───
// Provides revenue, enrollment, and rating analytics for an instructor's courses
// scoped to a time period. Designed so additional metrics (PPP impact, geographic
// breakdown, time series, per-course table) can be added to the return type without
// changing the existing interface.

export interface AnalyticsSummary {
  totalRevenue: number;
  totalEnrollments: number;
  averageRating: number | null;
  ratingCount: number;
}

const VALID_PERIODS = ["7d", "30d", "12m", "all"] as const;
export type AnalyticsPeriod = (typeof VALID_PERIODS)[number];

/**
 * Compute an ISO cutoff date for the given period, or null for "all time".
 */
function getPeriodCutoff(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "7d":
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    case "30d":
      now.setDate(now.getDate() - 30);
      return now.toISOString();
    case "12m":
      now.setMonth(now.getMonth() - 12);
      return now.toISOString();
    case "all":
      return null;
    default:
      return null;
  }
}

/**
 * Returns summary analytics (total revenue, total enrollments, average rating
 * with count) for all courses owned by the given instructor, scoped to the
 * requested time period.
 */
export function getInstructorAnalytics(
  instructorId: number,
  period: string
): AnalyticsSummary {
  const cutoff = getPeriodCutoff(period);

  // Get the instructor's course IDs
  const instructorCourses = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  const courseIds = instructorCourses.map((c) => c.id);

  // No courses → everything is zero / null
  if (courseIds.length === 0) {
    return {
      totalRevenue: 0,
      totalEnrollments: 0,
      averageRating: null,
      ratingCount: 0,
    };
  }

  // ── Total Revenue ──────────────────────────────────────────────

  const revenueConditions = [inArray(purchases.courseId, courseIds)];
  if (cutoff) {
    revenueConditions.push(gte(purchases.createdAt, cutoff));
  }

  const revenueResult = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(and(...revenueConditions))
    .get();

  const totalRevenue = revenueResult?.total ?? 0;

  // ── Total Enrollments ──────────────────────────────────────────

  const enrollmentConditions = [inArray(enrollments.courseId, courseIds)];
  if (cutoff) {
    enrollmentConditions.push(gte(enrollments.enrolledAt, cutoff));
  }

  const enrollmentResult = db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .get();

  const totalEnrollments = enrollmentResult?.total ?? 0;

  // ── Average Rating (+ count) ───────────────────────────────────

  const ratingConditions = [inArray(courseRatings.courseId, courseIds)];
  if (cutoff) {
    ratingConditions.push(gte(courseRatings.createdAt, cutoff));
  }

  const ratingResult = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(and(...ratingConditions))
    .get();

  const averageRating =
    ratingResult?.average != null
      ? Math.round(ratingResult.average * 10) / 10
      : null;
  const ratingCount = ratingResult?.count ?? 0;

  return {
    totalRevenue,
    totalEnrollments,
    averageRating,
    ratingCount,
  };
}
