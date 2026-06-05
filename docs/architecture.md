# Architecture

## Route Structure (`app/routes.ts`)

Flat-file routing with React Router v7. Key patterns:

- **`routes/layout.app.tsx`** — Authenticated layout wrapper. Its `loader` fetches the current user, all users (for dev user-switching), sidebar data (recent courses, progress), and PPP country info. Every route nested under this layout gets the sidebar + DevUI.
- **`routes/home.tsx`** — Public landing page (index route, no layout).
- **`routes/login.tsx`** / **`routes/signup.tsx`** — Auth pages (simulated, no passwords — user is switched via session).
- **`routes/courses.*`** — Student-facing: course browsing, lesson viewing, purchasing.
- **`routes/instructor.*`** — Instructor: CRUD for courses, modules, lessons, quizzes.
- **`routes/admin.*`** — Admin panels for users, courses, categories.
- **API routes** (`routes/api.*.ts`) — Mutation endpoints: logout, switch-user, video-tracking, set-dev-country.

## Database (`app/db/`)

- **`schema.ts`** — Drizzle SQLite schema. All tables and enums defined here. Key enums: `UserRole` (student/instructor/admin), `CourseStatus` (draft/published/archived), `LessonProgressStatus`, `QuestionType`, `TeamMemberRole`.
- **`index.ts`** — Creates the better-sqlite3 connection (`data.db`), enables WAL mode + foreign keys, exports the `db` instance.
- Migrations live in `drizzle/`. Run `pnpm db:generate` after schema changes, then `pnpm db:migrate` to apply.

## Service Layer (`app/services/`)

All database access goes through service functions — **never use `db` directly in route loaders/actions.** Each file handles one domain:

- `userService.ts`, `courseService.ts`, `moduleService.ts`, `lessonService.ts`, `categoryService.ts`
- `enrollmentService.ts`, `progressService.ts`, `purchaseService.ts`
- `quizService.ts`, `quizScoringService.ts`
- `commentService.ts` (with `commentConstants.ts` for soft-delete constants)
- `ratingService.ts`, `teamService.ts`, `couponService.ts`, `videoTrackingService.ts`

## Library Utilities (`app/lib/`)

- **`session.ts`** — Cookie-based session storage using React Router's `createCookieSessionStorage`. Stores `userId` and `devCountry`.
- **`ppp.ts`** — Purchasing Power Parity system. Maps countries to pricing tiers (1-6). Used to discount course prices based on user's country.
- **`country.server.ts`** — Server-only country detection via Cloudflare headers.
- **`validation.ts`** — Zod schemas shared across routes.
- **`markdown.server.ts`** — Server-side markdown rendering (uses `marked` + `shiki` for syntax highlighting, `dompurify` for sanitization).
- **`utils.ts`** — Shared client/server utilities.

## Authentication

No password-based auth. The app simulates login by setting `userId` in a cookie session. The `DevUI` component (visible in dev) lets you switch between seeded users.
