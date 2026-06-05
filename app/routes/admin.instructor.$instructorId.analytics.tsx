import { Link } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin.instructor.$instructorId.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getInstructorAnalytics } from "~/services/analyticsService";
import { AnalyticsDashboard } from "~/components/analytics-dashboard";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent } from "~/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";

const periodSchema = z.enum(["7d", "30d", "12m", "all"]);

export function meta() {
  return [
    { title: "Instructor Analytics — Cadence" },
    { name: "description", content: "View instructor course revenue analytics" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", {
      status: 403,
    });
  }

  const instructorId = Number(params.instructorId);
  if (Number.isNaN(instructorId) || instructorId <= 0) {
    throw data("Invalid instructor ID.", { status: 400 });
  }

  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? "30d";

  const periodResult = periodSchema.safeParse(rawPeriod);
  if (!periodResult.success) {
    throw data("Invalid time period.", { status: 400 });
  }

  const analytics = getInstructorAnalytics(instructorId, periodResult.data);

  return { analytics, period: periodResult.data };
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-6">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="mb-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>

      <div className="mb-6 flex gap-1 border-b">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-9 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6">
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Skeleton className="mb-4 h-4 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mb-3 h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminInstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { analytics, period } = loaderData;

  return <AnalyticsDashboard analytics={analytics} period={period} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message =
    "An unexpected error occurred while loading the analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else if (error.status === 400) {
      title = "Invalid request";
      message =
        typeof error.data === "string"
          ? error.data
          : "The requested resource is not valid.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/admin/users">
            <Button variant="outline">Manage Users</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
