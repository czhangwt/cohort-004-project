import { useState } from "react";
import { Link } from "react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "~/lib/utils";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DollarSign, Users, Star, TrendingUp, ArrowUpDown } from "lucide-react";
import type {
  AnalyticsData,
  TimeSeriesPoint,
  PerCourseData,
} from "~/services/analyticsService";

interface AnalyticsDashboardProps {
  analytics: AnalyticsData;
  period: string;
}

const PERIODS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
  { value: "all", label: "All Time" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────

function formatChartDate(date: string, isMonthly: boolean): string {
  if (isMonthly) {
    // "YYYY-MM" → "Jan 2026"
    const [year, month] = date.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  // "YYYY-MM-DD" → "Jun 5"
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(date: string, isMonthly: boolean): string {
  if (isMonthly) {
    const [year, month] = date.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const TABLE_COLUMNS = [
  { key: "courseTitle", label: "Course" },
  { key: "listPrice", label: "List Price" },
  { key: "revenue", label: "Revenue" },
  { key: "salesCount", label: "Sales" },
  { key: "enrollmentCount", label: "Enrollments" },
  { key: "averageRating", label: "Avg Rating" },
  { key: "ratingCount", label: "Rating Count" },
] as const;

type SortKey = (typeof TABLE_COLUMNS)[number]["key"];

// ─── Revenue Chart ────────────────────────────────────────────────────

function RevenueChart({
  timeSeries,
  period,
}: {
  timeSeries: TimeSeriesPoint[];
  period: string;
}) {
  const isMonthly = period === "12m" || period === "all";

  if (timeSeries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Over Time
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No revenue data yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = timeSeries.map((point) => ({
    ...point,
    displayDate: formatChartDate(point.date, isMonthly),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Revenue Over Time
          </CardTitle>
          <TrendingUp className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
              width={60}
            />
            <Tooltip
              formatter={(value) => [
                formatPrice(Number(value ?? 0)),
                "Revenue",
              ]}
              labelFormatter={(_label, payload) => {
                const item = (
                  payload as unknown as Array<{ payload: TimeSeriesPoint }>
                )[0]?.payload;
                if (!item) return "";
                return formatTooltipDate(item.date, isMonthly);
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Per-Course Table ─────────────────────────────────────────────────

function PerCourseTable({ perCourse }: { perCourse: PerCourseData[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  if (perCourse.length === 0) {
    return null;
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default desc for revenue, asc for course title, desc for everything else
      setSortAsc(key === "courseTitle");
    }
  }

  const sorted = [...perCourse].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    let cmp: number;
    if (aVal === null && bVal === null) {
      cmp = 0;
    } else if (aVal === null) {
      cmp = 1;
    } else if (bVal === null) {
      cmp = -1;
    } else if (typeof aVal === "string") {
      cmp = aVal.localeCompare(bVal as string);
    } else {
      cmp = (aVal as number) - (bVal as number);
    }

    return sortAsc ? cmp : -cmp;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Per-Course Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap select-none",
                      col.key === "courseTitle" ? "" : "text-right",
                      "cursor-pointer hover:text-foreground transition-colors"
                    )}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown
                        className={cn(
                          "size-3",
                          sortKey === col.key
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                        )}
                      />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((course) => (
                <tr
                  key={course.courseId}
                  className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {course.courseTitle}
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    {formatPrice(course.listPrice)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    {formatPrice(course.revenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {course.salesCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {course.enrollmentCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {course.averageRating !== null
                      ? course.averageRating.toFixed(1)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {course.ratingCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export function AnalyticsDashboard({
  analytics,
  period,
}: AnalyticsDashboardProps) {
  const isMonthly = period === "12m" || period === "all";

  // Show empty state when instructor has no courses OR has courses but no data
  // in the selected period (no revenue, no enrollments, no ratings).
  const hasNoCourses = analytics.perCourse.length === 0;
  const hasNoData =
    !hasNoCourses &&
    analytics.totalRevenue === 0 &&
    analytics.totalEnrollments === 0 &&
    analytics.ratingCount === 0;
  const isEmpty = hasNoCourses || hasNoData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Track your course revenue and performance
        </p>
      </div>

      {/* Period selector */}
      <div className="mb-6 flex gap-1 border-b">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            to={`?period=${p.value}`}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium -mb-px transition-colors",
              period === p.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center">
          <TrendingUp className="mb-4 size-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">No revenue data yet</h2>
          <p className="text-muted-foreground">
            Publish a course to start tracking analytics.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Revenue
                  </CardTitle>
                  <DollarSign className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPrice(analytics.totalRevenue)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Enrollments
                  </CardTitle>
                  <Users className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.totalEnrollments.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Average Rating
                  </CardTitle>
                  <Star className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.averageRating !== null
                    ? analytics.averageRating.toFixed(1)
                    : "—"}
                </div>
                {analytics.ratingCount > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    from {analytics.ratingCount}{" "}
                    {analytics.ratingCount === 1 ? "rating" : "ratings"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue chart */}
          <div className="mb-6">
            <RevenueChart timeSeries={analytics.timeSeries} period={period} />
          </div>

          {/* Per-course table */}
          <PerCourseTable perCourse={analytics.perCourse} />
        </>
      )}
    </div>
  );
}
