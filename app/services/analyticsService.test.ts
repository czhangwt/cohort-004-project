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
});
