import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { getInstructorAnalytics } from "./analyticsService";

// Freeze "now" to a fixed point so period math is deterministic.
const NOW = new Date("2026-06-05T12:00:00.000Z");

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

// Helper to create a course owned by the base instructor
function createCourse(
  overrides: Partial<{
    title: string;
    slug: string;
    price: number;
  }> = {}
) {
  return testDb
    .insert(schema.courses)
    .values({
      title: overrides.title ?? "Analytics Course",
      slug: overrides.slug ?? `analytics-course-${Date.now()}-${Math.random()}`,
      description: "A course for analytics testing",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
      price: overrides.price ?? 4999,
    })
    .returning()
    .get();
}

// Helper to create a purchase at a given ISO timestamp
function createPurchase(
  courseId: number,
  userId: number,
  pricePaid: number,
  createdAt: string
) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, pricePaid, createdAt, country: "US" })
    .returning()
    .get();
}

// Helper to create an enrollment at a given ISO timestamp
function createEnrollment(
  courseId: number,
  userId: number,
  enrolledAt: string
) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt })
    .returning()
    .get();
}

// Helper to create a rating at a given ISO timestamp
function createRating(
  courseId: number,
  userId: number,
  rating: number,
  createdAt: string
) {
  return testDb
    .insert(schema.courseRatings)
    .values({ userId, courseId, rating, createdAt, updatedAt: createdAt })
    .returning()
    .get();
}

describe("analyticsService", () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── No Courses ────────────────────────────────────────────────

  describe("when instructor has no courses", () => {
    it("returns zero revenue, zero enrollments, null rating", () => {
      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(0);
      expect(result.totalEnrollments).toBe(0);
      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });
  });

  // ─── No Data ───────────────────────────────────────────────────

  describe("when instructor has courses but no purchases/enrollments/ratings", () => {
    it("returns zero revenue, zero enrollments, null rating", () => {
      createCourse();

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(0);
      expect(result.totalEnrollments).toBe(0);
      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });
  });

  // ─── Total Revenue ─────────────────────────────────────────────

  describe("totalRevenue", () => {
    it("sums pricePaid across all instructor courses", () => {
      const course1 = createCourse();
      const course2 = createCourse();

      createPurchase(course1.id, base.user.id, 4999, iso(-1_000_000));
      createPurchase(course1.id, base.user.id, 3000, iso(-2_000_000));
      createPurchase(course2.id, base.user.id, 1500, iso(-3_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(4999 + 3000 + 1500);
    });

    it("excludes purchases from other instructors courses", () => {
      const course1 = createCourse();

      // Another instructor's course
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      createPurchase(course1.id, base.user.id, 4999, iso(-1_000_000));
      createPurchase(otherCourse.id, base.user.id, 9999, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(4999);
    });

    it("returns 0 when no purchases exist", () => {
      createCourse();

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(0);
    });
  });

  // ─── Total Enrollments ─────────────────────────────────────────

  describe("totalEnrollments", () => {
    it("counts enrollments across all instructor courses", () => {
      const course1 = createCourse();
      const course2 = createCourse();

      createEnrollment(course1.id, base.user.id, iso(-1_000_000));
      createEnrollment(course2.id, base.user.id, iso(-2_000_000));

      // Second user enrolling in course1
      const user2 = testDb
        .insert(schema.users)
        .values({
          name: "User 2",
          email: "user2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();
      createEnrollment(course1.id, user2.id, iso(-500_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalEnrollments).toBe(3);
    });

    it("excludes enrollments from other instructors courses", () => {
      const course1 = createCourse();

      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other2@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-2",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      createEnrollment(course1.id, base.user.id, iso(-1_000_000));
      createEnrollment(otherCourse.id, base.user.id, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalEnrollments).toBe(1);
    });
  });

  // ─── Average Rating ────────────────────────────────────────────

  describe("averageRating and ratingCount", () => {
    it("computes average rating across all instructor courses", () => {
      const course1 = createCourse();
      const course2 = createCourse();

      createRating(course1.id, base.user.id, 5, iso(-1_000_000));
      createRating(course2.id, base.user.id, 3, iso(-2_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.averageRating).toBe(4.0); // (5+3)/2 = 4.0
      expect(result.ratingCount).toBe(2);
    });

    it("rounds average to one decimal place", () => {
      const course1 = createCourse();

      createRating(course1.id, base.user.id, 4, iso(-1_000_000));
      createRating(course1.id, base.user.id, 5, iso(-2_000_000));
      createRating(course1.id, base.user.id, 5, iso(-3_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      // (4+5+5)/3 = 4.666... → rounded to 4.7
      expect(result.averageRating).toBe(4.7);
      expect(result.ratingCount).toBe(3);
    });

    it("returns null average and 0 count when no ratings", () => {
      createCourse();

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });

    it("excludes ratings from other instructors courses", () => {
      const course1 = createCourse();

      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other3@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-3",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      createRating(course1.id, base.user.id, 4, iso(-1_000_000));
      createRating(otherCourse.id, base.user.id, 1, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.averageRating).toBe(4.0);
      expect(result.ratingCount).toBe(1);
    });
  });

  // ─── Time Period Filtering ─────────────────────────────────────

  describe("time period filtering", () => {
    it("7d period includes data within the last 7 days", () => {
      const course1 = createCourse();

      // 3 days ago → included
      createPurchase(course1.id, base.user.id, 1000, iso(-3 * 24 * 60 * 60 * 1000));
      // 5 days ago → included
      createEnrollment(course1.id, base.user.id, iso(-5 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "7d");

      expect(result.totalRevenue).toBe(1000);
      expect(result.totalEnrollments).toBe(1);
    });

    it("7d period excludes data older than 7 days", () => {
      const course1 = createCourse();

      // 8 days ago → excluded
      createPurchase(course1.id, base.user.id, 1000, iso(-8 * 24 * 60 * 60 * 1000));
      // 10 days ago → excluded
      createEnrollment(course1.id, base.user.id, iso(-10 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "7d");

      expect(result.totalRevenue).toBe(0);
      expect(result.totalEnrollments).toBe(0);
    });

    it("30d period includes data within the last 30 days", () => {
      const course1 = createCourse();

      // 20 days ago → included
      createPurchase(course1.id, base.user.id, 2000, iso(-20 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "30d");

      expect(result.totalRevenue).toBe(2000);
    });

    it("30d period excludes data older than 30 days", () => {
      const course1 = createCourse();

      // 31 days ago → excluded
      createPurchase(course1.id, base.user.id, 500, iso(-31 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "30d");

      expect(result.totalRevenue).toBe(0);
    });

    it("12m period includes data within the last 12 months", () => {
      const course1 = createCourse();

      // ~6 months ago → included
      createPurchase(course1.id, base.user.id, 3000, iso(-180 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "12m");

      expect(result.totalRevenue).toBe(3000);
    });

    it("12m period excludes data older than 12 months", () => {
      const course1 = createCourse();

      // ~13 months ago → excluded
      createPurchase(course1.id, base.user.id, 3000, iso(-400 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "12m");

      expect(result.totalRevenue).toBe(0);
    });

    it("all period includes data from any time", () => {
      const course1 = createCourse();

      // Very old purchase
      createPurchase(course1.id, base.user.id, 7500, iso(-2 * 365 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(7500);
    });

    it("scopes ratings to the time period", () => {
      const course1 = createCourse();

      createRating(course1.id, base.user.id, 5, iso(-3 * 24 * 60 * 60 * 1000)); // 3 days ago
      createRating(course1.id, base.user.id, 1, iso(-40 * 24 * 60 * 60 * 1000)); // 40 days ago

      const result = getInstructorAnalytics(base.instructor.id, "7d");

      // Only the 3-day-old rating is within 7d
      expect(result.averageRating).toBe(5.0);
      expect(result.ratingCount).toBe(1);
    });

    it("includes data exactly at the cutoff boundary", () => {
      const course1 = createCourse();

      // Exactly 7 days ago
      createPurchase(course1.id, base.user.id, 2500, iso(-7 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "7d");

      // gte means the boundary date is included
      expect(result.totalRevenue).toBe(2500);
    });
  });

  // ─── Instructor Isolation ──────────────────────────────────────

  describe("instructor isolation", () => {
    it("only returns data for courses owned by the specified instructor", () => {
      const course1 = createCourse();

      // Create another instructor with their own course
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other-iso@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-iso",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      createPurchase(course1.id, base.user.id, 1000, iso(-1_000_000));
      createPurchase(otherCourse.id, base.user.id, 5000, iso(-1_000_000));
      createEnrollment(course1.id, base.user.id, iso(-1_000_000));
      createEnrollment(otherCourse.id, base.user.id, iso(-1_000_000));
      createRating(course1.id, base.user.id, 5, iso(-1_000_000));
      createRating(otherCourse.id, base.user.id, 1, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(1000);
      expect(result.totalEnrollments).toBe(1);
      expect(result.averageRating).toBe(5.0);
      expect(result.ratingCount).toBe(1);
    });
  });

  // ─── Multiple Courses ──────────────────────────────────────────

  describe("multiple courses", () => {
    it("aggregates data across all instructor courses", () => {
      const course1 = createCourse({ title: "Course A", slug: "course-a" });
      const course2 = createCourse({ title: "Course B", slug: "course-b" });
      const course3 = createCourse({ title: "Course C", slug: "course-c" });

      createPurchase(course1.id, base.user.id, 1000, iso(-1_000_000));
      createPurchase(course2.id, base.user.id, 2000, iso(-1_000_000));
      createPurchase(course3.id, base.user.id, 3000, iso(-1_000_000));

      createEnrollment(course1.id, base.user.id, iso(-1_000_000));
      createEnrollment(course2.id, base.user.id, iso(-1_000_000));

      createRating(course1.id, base.user.id, 5, iso(-1_000_000));
      createRating(course2.id, base.user.id, 4, iso(-1_000_000));
      createRating(course3.id, base.user.id, 3, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      expect(result.totalRevenue).toBe(6000);
      expect(result.totalEnrollments).toBe(2);
      expect(result.averageRating).toBe(4.0); // (5+4+3)/3 = 4.0
      expect(result.ratingCount).toBe(3);
    });
  });

  // ─── Time Series ───────────────────────────────────────────────────

  describe("timeSeries", () => {
    describe("daily granularity (7d, 30d)", () => {
      it("returns daily data points for 7d period", () => {
        const course1 = createCourse();

        // 1 day ago → $10
        createPurchase(course1.id, base.user.id, 1000, iso(-1 * 24 * 60 * 60 * 1000));
        // 3 days ago → $20
        createPurchase(course1.id, base.user.id, 2000, iso(-3 * 24 * 60 * 60 * 1000));
        // 5 days ago → $30
        createPurchase(course1.id, base.user.id, 3000, iso(-5 * 24 * 60 * 60 * 1000));

        const result = getInstructorAnalytics(base.instructor.id, "7d");

        // Should have 8 data points (day 0 through day 7, inclusive)
        expect(result.timeSeries.length).toBe(8);
        // All dates should be in YYYY-MM-DD format
        for (const point of result.timeSeries) {
          expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        // Total revenue across time series should match summary
        const tsTotal = result.timeSeries.reduce((sum, p) => sum + p.revenue, 0);
        expect(tsTotal).toBe(result.totalRevenue);
      });

      it("returns daily data points for 30d period", () => {
        const course1 = createCourse();

        createPurchase(course1.id, base.user.id, 1500, iso(-10 * 24 * 60 * 60 * 1000));
        createPurchase(course1.id, base.user.id, 2500, iso(-20 * 24 * 60 * 60 * 1000));

        const result = getInstructorAnalytics(base.instructor.id, "30d");

        // Should have 31 data points (day 0 through day 30, inclusive)
        expect(result.timeSeries.length).toBe(31);
        const tsTotal = result.timeSeries.reduce((sum, p) => sum + p.revenue, 0);
        expect(tsTotal).toBe(4000);
      });
    });

    describe("monthly granularity (12m, all)", () => {
      it("returns monthly data points for 12m period", () => {
        const course1 = createCourse();

        // 2 months ago
        const twoMonthsAgo = iso(-60 * 24 * 60 * 60 * 1000);
        createPurchase(course1.id, base.user.id, 5000, twoMonthsAgo);

        const result = getInstructorAnalytics(base.instructor.id, "12m");

        // Should have 13 months (current month + previous 12)
        expect(result.timeSeries.length).toBe(13);
        // All dates should be in YYYY-MM format
        for (const point of result.timeSeries) {
          expect(point.date).toMatch(/^\d{4}-\d{2}$/);
        }
        const tsTotal = result.timeSeries.reduce((sum, p) => sum + p.revenue, 0);
        expect(tsTotal).toBe(5000);
      });

      it("returns monthly data points for all period", () => {
        const course1 = createCourse();

        // Purchase made 14 months ago
        const fourteenMonthsAgo = iso(-425 * 24 * 60 * 60 * 1000);
        createPurchase(course1.id, base.user.id, 7500, fourteenMonthsAgo);

        const result = getInstructorAnalytics(base.instructor.id, "all");

        // Should span from the earliest purchase month to current month
        expect(result.timeSeries.length).toBeGreaterThanOrEqual(1);
        const tsTotal = result.timeSeries.reduce((sum, p) => sum + p.revenue, 0);
        expect(tsTotal).toBe(7500);
      });
    });

    describe("zero-revenue periods", () => {
      it("includes zero-revenue days with $0 data points (7d)", () => {
        const course1 = createCourse();

        // Only one purchase, 6 days ago
        createPurchase(course1.id, base.user.id, 5000, iso(-6 * 24 * 60 * 60 * 1000));

        const result = getInstructorAnalytics(base.instructor.id, "7d");

        // Every day in the range should be present
        const nonZeroDays = result.timeSeries.filter((p) => p.revenue > 0);
        expect(nonZeroDays.length).toBe(1);
        expect(nonZeroDays[0].revenue).toBe(5000);

        const zeroDays = result.timeSeries.filter((p) => p.revenue === 0);
        expect(zeroDays.length).toBeGreaterThan(0);
      });

      it("includes zero-revenue months with $0 data points (12m)", () => {
        const course1 = createCourse();

        // One purchase in the current month (very recent)
        createPurchase(course1.id, base.user.id, 3000, iso(-1 * 60 * 60 * 1000));

        const result = getInstructorAnalytics(base.instructor.id, "12m");

        const zeroMonths = result.timeSeries.filter((p) => p.revenue === 0);
        // Most months should be zero since purchase is in current month only
        expect(zeroMonths.length).toBeGreaterThan(0);
        expect(zeroMonths.length).toBe(12); // 12 months with zero, 1 with data
      });

      it("returns all-zero time series when no purchases exist", () => {
        createCourse();

        const result = getInstructorAnalytics(base.instructor.id, "7d");

        expect(result.timeSeries.length).toBe(8);
        for (const point of result.timeSeries) {
          expect(point.revenue).toBe(0);
        }
      });

      it("produces a continuous time series without gaps", () => {
        const course1 = createCourse();

        // Purchases at day 1 and day 5 ago
        createPurchase(course1.id, base.user.id, 1000, iso(-1 * 24 * 60 * 60 * 1000));
        createPurchase(course1.id, base.user.id, 2000, iso(-5 * 24 * 60 * 60 * 1000));

        const result = getInstructorAnalytics(base.instructor.id, "7d");

        // Verify dates are sequential (no gaps)
        for (let i = 1; i < result.timeSeries.length; i++) {
          const prev = new Date(result.timeSeries[i - 1].date + "T00:00:00Z");
          const curr = new Date(result.timeSeries[i].date + "T00:00:00Z");
          const diffMs = curr.getTime() - prev.getTime();
          expect(diffMs).toBe(24 * 60 * 60 * 1000); // exactly 1 day
        }
      });
    });

    it("returns empty array when instructor has no courses", () => {
      // Create an instructor with truly no courses (the base instructor has a seeded course)
      const noCourseInstructor = testDb
        .insert(schema.users)
        .values({
          name: "No Course Instructor",
          email: "nocourse-ts@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const result = getInstructorAnalytics(noCourseInstructor.id, "all");
      expect(result.timeSeries).toEqual([]);
    });
  });

  // ─── Per-Course Breakdown ───────────────────────────────────────────

  describe("perCourse", () => {
    it("returns all courses with correct data", () => {
      const course1 = createCourse({
        title: "React Basics",
        slug: "react-basics",
        price: 4999,
      });
      const course2 = createCourse({
        title: "Advanced CSS",
        slug: "advanced-css",
        price: 3999,
      });

      createPurchase(course1.id, base.user.id, 4999, iso(-1_000_000));
      createPurchase(course1.id, base.user.id, 4999, iso(-2_000_000)); // 2 sales for course1
      createPurchase(course2.id, base.user.id, 2999, iso(-1_000_000)); // PPP discounted

      createEnrollment(course1.id, base.user.id, iso(-1_000_000));
      createEnrollment(course2.id, base.user.id, iso(-1_000_000));
      createEnrollment(course2.id, base.user.id, iso(-500_000)); // 2 enrollments for course2

      createRating(course1.id, base.user.id, 5, iso(-1_000_000));
      createRating(course1.id, base.user.id, 4, iso(-2_000_000)); // avg 4.5 for course1
      createRating(course2.id, base.user.id, 3, iso(-1_000_000)); // avg 3.0 for course2

      const result = getInstructorAnalytics(base.instructor.id, "all");

      // Seeded course + 2 created = 3 total
      expect(result.perCourse).toHaveLength(3);

      // Course 1 (revenue 9998) should be first, Course 2 (revenue 2999) second
      const course1Data = result.perCourse.find(
        (c) => c.courseId === course1.id
      )!;
      expect(course1Data.courseTitle).toBe("React Basics");
      expect(course1Data.listPrice).toBe(4999);
      expect(course1Data.revenue).toBe(9998);
      expect(course1Data.salesCount).toBe(2);
      expect(course1Data.enrollmentCount).toBe(1);
      expect(course1Data.averageRating).toBe(4.5);
      expect(course1Data.ratingCount).toBe(2);

      // Course 2
      const course2Data = result.perCourse.find(
        (c) => c.courseId === course2.id
      )!;
      expect(course2Data.courseTitle).toBe("Advanced CSS");
      expect(course2Data.listPrice).toBe(3999);
      expect(course2Data.revenue).toBe(2999);
      expect(course2Data.salesCount).toBe(1);
      expect(course2Data.enrollmentCount).toBe(2);
      expect(course2Data.averageRating).toBe(3.0);
      expect(course2Data.ratingCount).toBe(1);

      // Verify sort order: course1 revenue > course2 revenue > seeded (0)
      const course1Index = result.perCourse.findIndex(
        (c) => c.courseId === course1.id
      );
      const course2Index = result.perCourse.findIndex(
        (c) => c.courseId === course2.id
      );
      expect(course1Index).toBeLessThan(course2Index);
    });

    it("is sorted by revenue descending by default", () => {
      const course1 = createCourse({ title: "Low Earner", slug: "low-earner" });
      const course2 = createCourse({ title: "High Earner", slug: "high-earner" });
      const course3 = createCourse({ title: "Mid Earner", slug: "mid-earner" });

      createPurchase(course1.id, base.user.id, 1000, iso(-1_000_000));
      createPurchase(course2.id, base.user.id, 5000, iso(-1_000_000));
      createPurchase(course3.id, base.user.id, 3000, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      // Seeded (0 revenue) + 3 created = 4 total
      // Sort: High Earner ($50) > Mid Earner ($30) > Low Earner ($10) > Seeded ($0)
      const sorted = result.perCourse.filter(
        (c) => c.courseTitle !== "Test Course"
      );
      expect(sorted).toHaveLength(3);
      expect(sorted[0].courseTitle).toBe("High Earner");
      expect(sorted[1].courseTitle).toBe("Mid Earner");
      expect(sorted[2].courseTitle).toBe("Low Earner");
    });

    it("handles courses with no purchases, enrollments, or ratings", () => {
      const emptyCourse = createCourse({
        title: "Empty Course",
        slug: "empty-course",
      });

      const result = getInstructorAnalytics(base.instructor.id, "all");

      // Seeded course + the one we just created
      const data = result.perCourse.find(
        (c) => c.courseId === emptyCourse.id
      );
      expect(data).toBeDefined();
      expect(data!.courseTitle).toBe("Empty Course");
      expect(data!.revenue).toBe(0);
      expect(data!.salesCount).toBe(0);
      expect(data!.enrollmentCount).toBe(0);
      expect(data!.averageRating).toBeNull();
      expect(data!.ratingCount).toBe(0);
    });

    it("scopes per-course data to the time period", () => {
      const course1 = createCourse({
        title: "Time Scoped",
        slug: "time-scoped",
      });

      // Old purchase (10 days ago)
      createPurchase(course1.id, base.user.id, 5000, iso(-10 * 24 * 60 * 60 * 1000));
      // Recent enrollment (2 days ago)
      createEnrollment(course1.id, base.user.id, iso(-2 * 24 * 60 * 60 * 1000));
      // Recent rating (1 day ago)
      createRating(course1.id, base.user.id, 5, iso(-1 * 24 * 60 * 60 * 1000));

      const result = getInstructorAnalytics(base.instructor.id, "7d");

      const data = result.perCourse.find((c) => c.courseId === course1.id);
      expect(data).toBeDefined();
      // Purchase is outside 7d window — revenue and sales should be 0
      expect(data!.revenue).toBe(0);
      expect(data!.salesCount).toBe(0);
      // Enrollment is within 7d window
      expect(data!.enrollmentCount).toBe(1);
      // Rating is within 7d window
      expect(data!.averageRating).toBe(5.0);
      expect(data!.ratingCount).toBe(1);
    });

    it("returns empty array when instructor has no courses", () => {
      // Create a fresh instructor who actually has no courses
      const emptyInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Course-less Instructor",
          email: "nocourses@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const result = getInstructorAnalytics(emptyInstructor.id, "all");
      expect(result.perCourse).toEqual([]);
    });

    it("only includes courses from the specified instructor", () => {
      const myCourse = createCourse({
        title: "My Course",
        slug: "my-course-per",
      });

      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other-per@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-per",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      createPurchase(myCourse.id, base.user.id, 1000, iso(-1_000_000));
      createPurchase(otherCourse.id, base.user.id, 9999, iso(-1_000_000));

      const result = getInstructorAnalytics(base.instructor.id, "all");

      // Should include the seeded course and myCourse, but not otherCourse
      const courseIds = result.perCourse.map((c) => c.courseId);
      expect(courseIds).toContain(myCourse.id);
      expect(courseIds).not.toContain(otherCourse.id);
      // Should include seeded course
      expect(courseIds).toContain(base.course.id);
    });
  });
});
