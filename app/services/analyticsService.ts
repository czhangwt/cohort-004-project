import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, purchases, enrollments, courseRatings } from "~/db/schema";

// ─── Analytics Service ───
// Provides revenue, enrollment, and rating analytics for an instructor's courses
// scoped to a time period. Designed so additional metrics (PPP impact, geographic
// breakdown, etc.) can be added to the return type without changing the existing
// interface.

export interface AnalyticsSummary {
  totalRevenue: number;
  totalEnrollments: number;
  averageRating: number | null;
  ratingCount: number;
}

export interface TimeSeriesPoint {
  date: string; // "YYYY-MM-DD" for daily, "YYYY-MM" for monthly
  revenue: number;
}

export interface PerCourseData {
  courseId: number;
  courseTitle: string;
  listPrice: number;
  revenue: number;
  salesCount: number;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
}

export interface AnalyticsData extends AnalyticsSummary {
  timeSeries: TimeSeriesPoint[];
  perCourse: PerCourseData[];
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

// ─── Date Range Helpers ───────────────────────────────────────────────

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function toYearMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** Generate every date (YYYY-MM-DD) from start to today inclusive. */
function generateDayRange(startIso: string): string[] {
  const days: string[] = [];
  const start = new Date(startIso);
  const startOnly = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const now = new Date();
  const endOnly = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  for (
    let d = new Date(startOnly);
    d <= endOnly;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Generate every month (YYYY-MM) from start to today inclusive. */
function generateMonthRange(startIso: string): string[] {
  const months: string[] = [];
  const start = new Date(startIso);
  const now = new Date();
  const cursor = new Date(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const end = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Find the earliest purchase date for the given courses, or null. */
function getEarliestPurchaseDate(courseIds: number[]): string | null {
  const result = db
    .select({
      earliest: sql<string | null>`min(${purchases.createdAt})`,
    })
    .from(purchases)
    .where(inArray(purchases.courseId, courseIds))
    .get();

  return result?.earliest ?? null;
}

// ─── Time Series ──────────────────────────────────────────────────────

function buildTimeSeries(
  courseIds: number[],
  cutoff: string | null,
  period: string
): TimeSeriesPoint[] {
  if (courseIds.length === 0) return [];

  const isMonthly = period === "12m" || period === "all";

  const purchaseConditions = [inArray(purchases.courseId, courseIds)];
  if (cutoff) {
    purchaseConditions.push(gte(purchases.createdAt, cutoff));
  }

  if (isMonthly) {
    const rows = db
      .select({
        month: sql<string>`strftime('%Y-%m', ${purchases.createdAt})`,
        revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      })
      .from(purchases)
      .where(and(...purchaseConditions))
      .groupBy(sql`strftime('%Y-%m', ${purchases.createdAt})`)
      .orderBy(sql`strftime('%Y-%m', ${purchases.createdAt})`)
      .all();

    const revenueMap = new Map(rows.map((r) => [r.month, r.revenue]));

    // Determine the start of the range
    let rangeStart: string;
    if (period === "all") {
      const earliestPurchase = getEarliestPurchaseDate(courseIds);
      rangeStart = earliestPurchase ?? new Date().toISOString();
    } else {
      rangeStart = cutoff!;
    }

    const months = generateMonthRange(rangeStart);

    return months.map((month) => ({
      date: month,
      revenue: revenueMap.get(month) ?? 0,
    }));
  }

  // Daily granularity (7d, 30d)
  const rows = db
    .select({
      date: sql<string>`date(${purchases.createdAt})`,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(and(...purchaseConditions))
    .groupBy(sql`date(${purchases.createdAt})`)
    .orderBy(sql`date(${purchases.createdAt})`)
    .all();

  const revenueMap = new Map(rows.map((r) => [r.date, r.revenue]));
  const days = generateDayRange(cutoff!);

  return days.map((day) => ({
    date: day,
    revenue: revenueMap.get(day) ?? 0,
  }));
}

// ─── Per-Course Breakdown ─────────────────────────────────────────────

function buildPerCourse(
  courseIds: number[],
  cutoff: string | null
): PerCourseData[] {
  if (courseIds.length === 0) return [];

  // Get all instructor courses
  const instructorCourses = db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      listPrice: courses.price,
    })
    .from(courses)
    .where(inArray(courses.id, courseIds))
    .all();

  // Revenue and sales count per course
  const purchaseConditions = [inArray(purchases.courseId, courseIds)];
  if (cutoff) purchaseConditions.push(gte(purchases.createdAt, cutoff));

  const purchaseData = db
    .select({
      courseId: purchases.courseId,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      salesCount: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(and(...purchaseConditions))
    .groupBy(purchases.courseId)
    .all();

  // Enrollment count per course
  const enrollmentConditions = [inArray(enrollments.courseId, courseIds)];
  if (cutoff) enrollmentConditions.push(gte(enrollments.enrolledAt, cutoff));

  const enrollmentData = db
    .select({
      courseId: enrollments.courseId,
      enrollmentCount: sql<number>`count(*)`,
    })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .groupBy(enrollments.courseId)
    .all();

  // Rating data per course
  const ratingConditions = [inArray(courseRatings.courseId, courseIds)];
  if (cutoff) ratingConditions.push(gte(courseRatings.createdAt, cutoff));

  const ratingData = db
    .select({
      courseId: courseRatings.courseId,
      averageRating: sql<number | null>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(and(...ratingConditions))
    .groupBy(courseRatings.courseId)
    .all();

  // Merge into maps
  const purchaseMap = new Map(purchaseData.map((p) => [p.courseId, p]));
  const enrollmentMap = new Map(enrollmentData.map((e) => [e.courseId, e]));
  const ratingMap = new Map(ratingData.map((r) => [r.courseId, r]));

  const result: PerCourseData[] = instructorCourses.map((course) => {
    const p = purchaseMap.get(course.courseId);
    const e = enrollmentMap.get(course.courseId);
    const r = ratingMap.get(course.courseId);

    return {
      courseId: course.courseId,
      courseTitle: course.courseTitle,
      listPrice: course.listPrice,
      revenue: p?.revenue ?? 0,
      salesCount: p?.salesCount ?? 0,
      enrollmentCount: e?.enrollmentCount ?? 0,
      averageRating:
        r?.averageRating != null
          ? Math.round(r.averageRating * 10) / 10
          : null,
      ratingCount: r?.ratingCount ?? 0,
    };
  });

  // Default sort: revenue descending
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Returns summary analytics (total revenue, total enrollments, average rating
 * with count) for all courses owned by the given instructor, scoped to the
 * requested time period. Also returns a revenue time series and per-course
 * breakdown.
 */
export function getInstructorAnalytics(
  instructorId: number,
  period: string
): AnalyticsData {
  const cutoff = getPeriodCutoff(period);

  // Get the instructor's course IDs
  const instructorCourses = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  const courseIds = instructorCourses.map((c) => c.id);

  // No courses → everything is zero / null / empty
  if (courseIds.length === 0) {
    return {
      totalRevenue: 0,
      totalEnrollments: 0,
      averageRating: null,
      ratingCount: 0,
      timeSeries: [],
      perCourse: [],
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

  // ── Time Series & Per-Course ───────────────────────────────────

  const timeSeries = buildTimeSeries(courseIds, cutoff, period);
  const perCourse = buildPerCourse(courseIds, cutoff);

  return {
    totalRevenue,
    totalEnrollments,
    averageRating,
    ratingCount,
    timeSeries,
    perCourse,
  };
}
