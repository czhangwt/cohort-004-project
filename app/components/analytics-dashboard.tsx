import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DollarSign, Users, Star } from "lucide-react";
import type { AnalyticsSummary } from "~/services/analyticsService";

interface AnalyticsDashboardProps {
  analytics: AnalyticsSummary;
  period: string;
}

const PERIODS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
  { value: "all", label: "All Time" },
] as const;

export function AnalyticsDashboard({
  analytics,
  period,
}: AnalyticsDashboardProps) {
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

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
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
    </div>
  );
}
