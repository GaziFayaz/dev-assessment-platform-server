# Backend Requirements & Technical Architecture Specification
## Developer Assessment & Coding Platform Server
**Category**: Education / Recruitment SaaS Platform  
**Target Stack**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Better Auth

---

## 1. Executive Summary & Domain Scope

The **Developer Assessment & Coding Platform** is a multi-tenant recruitment and educational testing system that enables organizations to design assessments, curate question banks (MCQ, written/essay, and coding challenges), invite candidates via secure invitations, track timed attempts, and perform structured human evaluations to generate candidate scorecards and performance analytics.

### Key Architectural Pillars
1. **Modern Authentication & Authorization (Better Auth)**:
   - Utilizes **Better Auth** with the Prisma database adapter.
   - Leverages official Better Auth plugins:
     - **`organization`**: Multi-tenancy (Organizations, Memberships, Invitations, active organization context).
     - **`admin`**: Platform-wide administrative governance (`PLATFORM_ADMIN`).
     - **`bearer`**: Support for both HTTP-only cookies and `Authorization: Bearer <token>` headers for API clients.
2. **Hybrid Evaluation (No Auto-Judge Engine)**:
   - **No containerized code execution engine** (no Judge0 / Docker runner).
   - **Automated Grading for MCQs**: Scored automatically upon submission against correct answer keys.
   - **Human Evaluation for Coding & Written Problems**: Routed to an **Evaluation Queue** where **Recruiters** or **Company Admins** review code/essays against defined rubrics, award points, and provide feedback.
3. **Mandatory Candidate Account Model (Option B)**:
   - All test-takers must authenticate via Better Auth (sign up / log in with their email) before starting an assessment.
   - The system verifies that the logged-in candidate's verified email matches the invitation record before granting attempt access.
4. **Mandatory CLI-First Tooling & Schema Discipline**:
   - Strictly mandates official CLI tooling for dependency management (`npm`), schema generation (`@better-auth/cli`), database migrations (`prisma migrate`), and compile-time verification (`tsc`).

---

## 2. User Personas & Role-Based Access Control (RBAC)

Better Auth models user identity across two tiers: **Platform Level** (global role) and **Organization Level** (company role).

### 2.1 Role Hierarchy

| Role | Domain Tier | Managed By | Key Capabilities & Responsibilities |
| :--- | :--- | :--- | :--- |
| **`PLATFORM_ADMIN`** | Global Platform | Better Auth `admin` plugin (`role: "admin"`) | System-wide oversight, company onboarding/moderation, platform user administration, global metrics. |
| **`COMPANY_ADMIN`** | Company Tenant | Better Auth `organization` plugin (`role: "admin"`) | Full organization authority. Manages company profile, invites and manages company members (`RECRUITER` and other `COMPANY_ADMIN`s), problem bank, assessments, candidate invitations, evaluations, and reports. |
| **`RECRUITER`** | Company Tenant | Better Auth `organization` plugin (`role: "recruiter"`) | Recruitment lifecycle manager. Curates problem bank questions, builds and publishes assessments, sends candidate invitations, grades submissions in the evaluation queue, and views reports. |
| **`CANDIDATE`** | Assessment Session | Standard Better Auth user (`role: "user"`) | Registered user who accepts assessment invitations, launches timed assessment sessions, writes and submits answers, and views candidate scorecards. |

---

## 3. Modular Clean Architecture & Better Auth Integration

The backend follows a **Modular Clean Layered Architecture** with an integrated Better Auth pipeline:

```
src/
├── app.ts                  # Express application configuration & middleware pipeline
├── server.ts               # HTTP server entry point & graceful shutdown
├── config/                 # Environment variables (Zod validated), constants
├── lib/
│   ├── prisma.ts           # Prisma client singleton instance
│   └── auth.ts             # Better Auth instance, Prisma adapter & plugin setup
├── errors/                 # AppError class, error codes, global error handler middleware
├── middlewares/            # Auth session guard, organization role guard, validation
├── routes/                 # Aggregated API router (/api/v1/...)
└── modules/                # Feature-based domain modules
    ├── problem/            # Problem bank: MCQ, Written, Coding questions & rubrics
    ├── assessment/         # Assessment builder, configuration, publish lifecycle
    ├── invitation/         # Candidate invitations & invitation verification
    ├── attempt/            # Timed assessment attempt engine, draft autosave, submission
    ├── evaluation/         # Evaluation queue, manual scoring, reviewer feedback
    └── report/             # Score aggregation, candidate report cards, analytics
```

### 3.1 Better Auth Configuration (`src/lib/auth.ts`)
```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { bearer } from "better-auth/plugins/bearer";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      roles: {
        admin: {},      // COMPANY_ADMIN
        recruiter: {},  // RECRUITER
      },
      allowUserToCreateOrganization: async (user) => true,
    }),
    admin(),
    bearer(),
  ],
});
```

### 3.2 Express Mounting & Authentication Middlewares

#### Better Auth Handler in Express (`src/app.ts`)
```typescript
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";

// Mount Better Auth router
app.all("/api/auth/*", toNodeHandler(auth));
```

#### Authentication Guard (`src/middlewares/auth.middleware.ts`)
```typescript
import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ success: false, message: "Unauthorized: Active session required" });
  }

  req.user = session.user;
  req.session = session.session;
  next();
};

export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden: Platform admin privileges required" });
  }
  next();
};

export const requireCompanyRole = (allowedRoles: ("admin" | "recruiter")[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req.headers["x-organization-id"] as string) || req.session?.activeOrganizationId;

    if (!orgId) {
      return res.status(400).json({ success: false, message: "Active organization context required" });
    }

    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id,
        },
      },
    });

    if (!member || !allowedRoles.includes(member.role as any)) {
      return res.status(403).json({ success: false, message: "Forbidden: Insufficient company permissions" });
    }

    req.organizationId = orgId;
    req.companyMember = member;
    next();
  };
};
```

---

## 4. Prisma Relational Schema & Data Modeling

> [!IMPORTANT]
> The Better Auth models below (`User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, `Invitation`) must be generated and kept synchronized using the **official Better Auth CLI** (`npx @better-auth/cli@latest generate`). Do NOT manually craft or guess these tables.

### 4.1 Domain Enums
```prisma
enum QuestionType {
  MCQ_SINGLE       // Single choice
  MCQ_MULTIPLE     // Multiple choice
  WRITTEN          // Short/long written answer
  CODING           // Code snippet / solution implementation
}

enum Difficulty {
  EASY
  MEDIUM
  HARD
}

enum AssessmentStatus {
  DRAFT            // Being constructed by Recruiter / Admin
  PUBLISHED        // Ready for scheduling / invitations
  ACTIVE           // Currently open for candidate attempts
  CLOSED           // Past due date / no further attempts allowed
  ARCHIVED         // Deprecated
}

enum AttemptStatus {
  INVITED          // Invitation sent, candidate not yet started
  IN_PROGRESS      // Candidate started the assessment (timer running)
  SUBMITTED        // Candidate manually submitted answers
  AUTO_SUBMITTED   // Timer expired, system auto-finalized
  UNDER_REVIEW     // In evaluation queue awaiting human grading
  COMPLETED        // All sections evaluated, final score ready
  EXPIRED          // Invitation expired without attempt
}

enum EvaluationStatus {
  NOT_REQUIRED     // Fully automated (e.g. 100% MCQ assessment)
  PENDING          // Awaiting reviewer claim/assignment
  IN_REVIEW        // Recruiter/Admin is actively grading
  EVALUATED        // Manual evaluation finalized
}
```

### 4.2 Entity Relationship Blueprint (Prisma Schema)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// =============================================================
// BETTER AUTH CORE MODELS (Generated via @better-auth/cli)
// =============================================================

model User {
  id              String           @id @default(uuid())
  name            String
  email           String           @unique
  emailVerified   Boolean          @default(false)
  image           String?
  role            String           @default("user") // "admin" (PLATFORM_ADMIN) or "user"
  banned          Boolean?         @default(false)
  banReason       String?
  banExpires      DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  sessions        Session[]
  accounts        Account[]
  members         Member[]
  invitations     Invitation[]

  // Domain Relations
  createdProblems Problem[]        @relation("ProblemCreator")
  createdAssessments Assessment[]  @relation("AssessmentCreator")
  evaluations     EvaluationReview[]
  attempts        AssessmentAttempt[]

  @@index([email])
}

model Session {
  id                   String       @id @default(uuid())
  userId               String
  token                String       @unique
  expiresAt            DateTime
  ipAddress            String?
  userAgent            String?
  activeOrganizationId String?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  user                 User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Account {
  id                    String       @id @default(uuid())
  userId                String
  accountId             String
  providerId            String
  accessToken           String?      @db.Text
  refreshToken          String?      @db.Text
  idToken               String?      @db.Text
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?      @db.Text
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  user                  User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
  @@index([userId])
}

model Verification {
  id         String   @id @default(uuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([identifier, value])
}

// =============================================================
// BETTER AUTH ORGANIZATION PLUGIN (COMPANY MULTI-TENANCY)
// =============================================================

model Organization {
  id          String        @id @default(uuid())
  name        String
  slug        String        @unique
  logo        String?
  metadata    String?       @db.Text
  createdAt   DateTime      @default(now())

  members     Member[]
  invitations Invitation[]

  // Domain Relations
  problems    Problem[]
  assessments Assessment[]

  @@index([slug])
}

model Member {
  id             String       @id @default(uuid())
  organizationId String
  userId         String
  role           String       // "admin" (COMPANY_ADMIN) or "recruiter" (RECRUITER)
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@index([organizationId])
}

model Invitation {
  id             String       @id @default(uuid())
  organizationId String
  email          String
  role           String       // "admin" or "recruiter"
  status         String       @default("pending") // pending, accepted, rejected, canceled
  expiresAt      DateTime
  inviterId      String

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [inviterId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
}

// =============================================================
// ASSESSMENT DOMAIN MODELS
// =============================================================

model Problem {
  id               String       @id @default(uuid())
  organizationId   String?      // Null if platform-level global question
  creatorId        String       // User who authored the problem
  title            String
  description      String       @db.Text
  type             QuestionType
  difficulty       Difficulty   @default(MEDIUM)
  defaultPoints    Float        @default(10.0)
  tags             String[]

  // MCQ Data: Array<{ id: string, text: string, isCorrect: boolean }>
  mcqOptions       Json?
  
  // Coding / Written Data
  codingDetails    Json?        // Starter code, allowed languages, sample I/O, constraints
  evaluationRubric String?      @db.Text

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  organization     Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  creator          User         @relation("ProblemCreator", fields: [creatorId], references: [id])
  assessmentProblems AssessmentProblem[]
  submissionAnswers  SubmissionAnswer[]

  @@index([organizationId, type])
}

model Assessment {
  id              String           @id @default(uuid())
  organizationId  String
  creatorId       String           // Recruiter or Admin who created the assessment
  title           String
  description     String?          @db.Text
  instructions    String?          @db.Text
  durationMinutes Int              // e.g. 60 minutes
  passingScore    Float?           // Minimum score to pass
  totalScore      Float            @default(0.0)
  status          AssessmentStatus @default(DRAFT)
  
  // Scheduling window (optional)
  validFrom       DateTime?
  validUntil      DateTime?

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  creator         User             @relation("AssessmentCreator", fields: [creatorId], references: [id])
  problems        AssessmentProblem[]
  invitations     CandidateInvitation[]
  attempts        AssessmentAttempt[]

  @@index([organizationId, status])
}

model AssessmentProblem {
  id              String       @id @default(uuid())
  assessmentId    String
  problemId       String
  orderIndex      Int          // Display ordering within assessment
  points          Float        // Points allocated for this problem in this assessment

  assessment      Assessment   @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  problem         Problem      @relation(fields: [problemId], references: [id], onDelete: Restrict)

  @@unique([assessmentId, problemId])
  @@index([assessmentId, orderIndex])
}

model CandidateInvitation {
  id              String       @id @default(uuid())
  assessmentId    String
  candidateEmail  String
  candidateName   String?
  inviteToken     String       @unique
  expiresAt       DateTime
  isAccepted      Boolean      @default(false)
  createdAt       DateTime     @default(now())

  assessment      Assessment   @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  attempts        AssessmentAttempt[]

  @@index([inviteToken])
  @@index([assessmentId, candidateEmail])
}

model AssessmentAttempt {
  id              String           @id @default(uuid())
  assessmentId    String
  invitationId    String?
  candidateId     String           // Foreign key to User (Mandatory per Option B)
  candidateEmail  String           // Captured from invitation / verified candidate account

  status          AttemptStatus    @default(INVITED)
  startedAt       DateTime?
  submittedAt     DateTime?
  expiresAt       DateTime?        // Hard deadline calculated at start: startedAt + durationMinutes

  // Auto-calculated score totals
  autoScore       Float            @default(0.0) // Automated MCQ score
  manualScore     Float            @default(0.0) // Points awarded by Recruiter/Admin
  totalScore      Float            @default(0.0) // autoScore + manualScore
  percentage      Float            @default(0.0)
  isPassed        Boolean?

  evaluationStatus EvaluationStatus @default(NOT_REQUIRED)

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  assessment      Assessment       @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  invitation      CandidateInvitation? @relation(fields: [invitationId], references: [id], onDelete: SetNull)
  candidate       User             @relation(fields: [candidateId], references: [id], onDelete: Restrict)
  answers         SubmissionAnswer[]
  evaluation      EvaluationReview?

  @@index([assessmentId, status])
  @@index([candidateId])
  @@index([candidateEmail])
}

model SubmissionAnswer {
  id              String       @id @default(uuid())
  attemptId       String
  problemId       String

  // Candidate Response
  selectedOptions String[]     // Selected option IDs for MCQs
  writtenAnswer   String?      @db.Text // Text content for written questions
  submittedCode   String?      @db.Text // Code content for coding questions
  selectedLanguage String?     // e.g. "typescript", "python", "javascript"

  // Automated Scoring (for MCQs)
  autoScore       Float        @default(0.0)
  isCorrect       Boolean?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  attempt         AssessmentAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  problem         Problem          @relation(fields: [problemId], references: [id], onDelete: Restrict)
  evaluationScore EvaluationScore?

  @@unique([attemptId, problemId])
}

model EvaluationReview {
  id              String           @id @default(uuid())
  attemptId       String           @unique
  evaluatorId     String?          // User (Recruiter or Company Admin) who reviewed
  overallFeedback String?          @db.Text
  evaluationStatus EvaluationStatus @default(PENDING)
  evaluatedAt     DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  attempt         AssessmentAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  evaluator       User?            @relation(fields: [evaluatorId], references: [id], onDelete: SetNull)
  scores          EvaluationScore[]

  @@index([evaluatorId, evaluationStatus])
}

model EvaluationScore {
  id              String           @id @default(uuid())
  reviewId        String
  submissionAnswerId String        @unique
  awardedPoints   Float            @default(0.0)
  maxPoints       Float
  feedback        String?          @db.Text
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  review          EvaluationReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  submissionAnswer SubmissionAnswer @relation(fields: [submissionAnswerId], references: [id], onDelete: Cascade)
}
```

---

## 5. Candidate Attempt Flow (Option B: Mandatory Account)

Under **Option B**, candidate access adheres to a strict verification flow:

```
Candidate receives invitation email with token
   │
   ▼
Candidate visits assessment portal link
   │
   ├─── Already has an account? ──► Logs in via Better Auth (/api/auth/sign-in/email)
   │
   └─── New user? ───────────────► Signs up via Better Auth (/api/auth/sign-up/email)
   │
   ▼
Authenticated Candidate calls POST /api/v1/attempts/start
   │
   ├── Backend verifies inviteToken exists, not expired, not already used
   ├── Backend verifies req.user.email matches CandidateInvitation.candidateEmail
   │     (Returns 403 if logged-in email doesn't match invitation)
   │
   ▼
Attempt Initialized:
   - status = IN_PROGRESS
   - candidateId = req.user.id
   - startedAt = NOW()
   - expiresAt = NOW() + durationMinutes
   - Returns sanitized question list
   │
   ▼
Candidate attempts questions (Autosaves drafts via PUT /api/v1/attempts/:id/answers)
   │
   ├── Candidate clicks "Submit" OR Server Timer expires (AUTO_SUBMITTED)
   │
   ▼
Immediate MCQ Auto-Scoring:
   ├── Only MCQs? ──► status = COMPLETED (Score published immediately)
   └── Has Code/Written? ──► status = UNDER_REVIEW (Routed to Evaluation Queue)
```

---

## 6. Evaluation Engine Workflow (Manual Review Architecture)

Because there is **no automated coding execution sandbox**, evaluations are performed by Recruiters and Company Admins:

1. **Submission Ingestion & Auto-Scoring**:
   - Upon attempt submission, the backend evaluates all `MCQ_SINGLE` and `MCQ_MULTIPLE` questions against correct keys.
   - For each exact match, `autoScore = points`; otherwise `0.0`.

2. **Evaluation Queue Routing**:
   - If the assessment contains any `WRITTEN` or `CODING` questions:
     - An `EvaluationReview` entity is initialized with `status: PENDING`.
     - The attempt status becomes `UNDER_REVIEW`.
   - If the assessment was 100% MCQs:
     - The attempt status immediately becomes `COMPLETED`.
     - `totalScore = autoScore`, `isPassed` is computed, and results are published.

3. **Claim & Review Process**:
   - Recruiters and Company Admins query the evaluation queue (`GET /api/v1/evaluations/queue`).
   - Reviewer claims an attempt (`POST /api/v1/evaluations/:reviewId/claim`).
   - Reviewer awards points (0 to `maxPoints`) and adds inline feedback for each written/coding answer against the `evaluationRubric`.

4. **Finalization & Aggregation**:
   - Reviewer submits final review (`POST /api/v1/evaluations/:reviewId/finalize`).
   - `manualScore` = sum of all `EvaluationScore.awardedPoints`.
   - `totalScore = autoScore + manualScore`.
   - `percentage = (totalScore / assessment.totalScore) * 100`.
   - `isPassed = totalScore >= assessment.passingScore`.
   - Attempt transitions to `COMPLETED`, review status transitions to `EVALUATED`.

---

## 7. REST API Endpoint Catalog

### 7.1 Better Auth Native Endpoints (`/api/auth/*`)
Handled directly by Better Auth's handler via `toNodeHandler(auth)`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/sign-up/email` | Register new user (Recruiter, Admin, or Candidate) |
| `POST` | `/api/auth/sign-in/email` | Authenticate user with email and password |
| `POST` | `/api/auth/sign-out` | Terminate session / revoke token |
| `GET` | `/api/auth/get-session` | Get currently logged-in user and active session |
| `POST` | `/api/auth/organization/create` | Create a new company organization |
| `GET` | `/api/auth/organization/list` | List organizations the user belongs to |
| `POST` | `/api/auth/organization/set-active` | Set active organization context in session |
| `POST` | `/api/auth/organization/invite-member`| Invite member (`admin` or `recruiter`) |
| `POST` | `/api/auth/organization/accept-invitation` | Accept team invitation |
| `POST` | `/api/auth/admin/ban-user` | Platform Admin: Ban a user |
| `POST` | `/api/auth/admin/list-users` | Platform Admin: List all registered platform users |

---

### 7.2 Custom Domain API Endpoints (`/api/v1/*`)
All custom business routes require `requireAuth` and appropriate role guards:

#### Problem Bank (`/api/v1/problems`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/problems` | `admin`, `recruiter` | Create problem (MCQ, Written, Coding) with rubric |
| `GET` | `/api/v1/problems` | `admin`, `recruiter` | List organization problems (filter by type, difficulty, tags) |
| `GET` | `/api/v1/problems/:id` | `admin`, `recruiter` | Get problem statement, sample I/O, rubric, and options |
| `PUT` | `/api/v1/problems/:id` | `admin`, `recruiter` | Update problem details (locked if in active assessment) |
| `DELETE` | `/api/v1/problems/:id` | `admin`, `recruiter` | Soft-delete / archive problem |

#### Assessment Builder (`/api/v1/assessments`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/assessments` | `admin`, `recruiter` | Create assessment draft (duration, passing score, title) |
| `GET` | `/api/v1/assessments` | `admin`, `recruiter` | List company assessments with status & metrics |
| `GET` | `/api/v1/assessments/:id` | `admin`, `recruiter` | Get assessment details with full problem set |
| `POST` | `/api/v1/assessments/:id/problems` | `admin`, `recruiter` | Add problems to assessment with points & display order |
| `DELETE` | `/api/v1/assessments/:id/problems/:problemId` | `admin`, `recruiter` | Remove problem from assessment draft |
| `PATCH` | `/api/v1/assessments/:id/status` | `admin`, `recruiter` | Transition status (DRAFT $\rightarrow$ PUBLISHED $\rightarrow$ ACTIVE $\rightarrow$ CLOSED) |
| `DELETE` | `/api/v1/assessments/:id` | `admin` | Archive / delete assessment |

#### Candidate Invitations (`/api/v1/assessments/:id/invitations`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/assessments/:id/invitations` | `admin`, `recruiter` | Send candidate invitations (single or bulk emails) |
| `GET` | `/api/v1/assessments/:id/invitations` | `admin`, `recruiter` | List sent invitations and status (Invited/Started/Done) |
| `GET` | `/api/v1/invitations/verify/:token` | Authenticated Candidate | Verify invite token against logged-in user email |

#### Candidate Attempt Engine (`/api/v1/attempts`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/attempts/start` | Authenticated Candidate | Validate invitation, start timed assessment, lock timer |
| `GET` | `/api/v1/attempts/:attemptId` | Authenticated Candidate | Get current attempt session, remaining time, answer drafts |
| `PUT` | `/api/v1/attempts/:attemptId/answers` | Authenticated Candidate | Autosave answer draft for a problem |
| `POST` | `/api/v1/attempts/:attemptId/submit` | Authenticated Candidate | Final submission of assessment answers |

#### Evaluation Queue & Review (`/api/v1/evaluations`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/evaluations/queue` | `admin`, `recruiter` | List attempts pending human evaluation (filter by assessment) |
| `GET` | `/api/v1/evaluations/:reviewId` | `admin`, `recruiter` | Get attempt submission details, candidate answers & rubrics |
| `POST` | `/api/v1/evaluations/:reviewId/claim` | `admin`, `recruiter` | Claim an evaluation review item |
| `POST` | `/api/v1/evaluations/:reviewId/score` | `admin`, `recruiter` | Score individual question with marks and feedback |
| `POST` | `/api/v1/evaluations/:reviewId/finalize` | `admin`, `recruiter` | Finalize evaluation, compute total scores, transition to COMPLETED |

#### Reports & Analytics (`/api/v1/reports`)
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reports/assessments/:id/summary` | `admin`, `recruiter` | Assessment stats (total attempts, pass rate, score distribution) |
| `GET` | `/api/v1/reports/attempts/:attemptId` | `admin`, `recruiter` | Detailed candidate scorecard (breakdown by question & rubric) |
| `GET` | `/api/v1/reports/candidate/my-results` | Authenticated Candidate | Candidate view of their own scorecard (if permitted) |

---

## 8. Backend Security & Integrity Strategies

1. **Better Auth Session & Bearer Validation**:
   - Requests are verified using `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.
   - The `bearer` plugin allows testing via Postman / curl with `Authorization: Bearer <session-token>` while supporting HTTP-only cookies in browsers.

2. **Mandatory Candidate Verification (Option B)**:
   - A candidate cannot start an assessment under another user's invitation.
   - When calling `POST /api/v1/attempts/start`, the server strictly checks:
     `CandidateInvitation.candidateEmail === req.user.email`.
   - If mismatch, request fails with `403 Forbidden: Logged-in email does not match invitation recipient`.

3. **Server-Authoritative Timer**:
   - Client-side countdown is cosmetic.
   - When attempt starts, `startedAt = NOW()` and `expiresAt = NOW() + durationMinutes + gracePeriod (60s)`.
   - On submission, if `NOW() > expiresAt`, the server auto-submits and rejects any further modifications.

4. **Submission Immutability**:
   - Once attempt status is `SUBMITTED`, `AUTO_SUBMITTED`, or `COMPLETED`, answer update routes return `403 Forbidden`.

5. **Tenant Isolation**:
   - All company queries strictly filter by `WHERE organizationId = req.organizationId`.

---

## 9. Development Tooling & Mandatory CLI-First Operational Standards

> [!CAUTION]
> **Strict Operational Rule for AI Agents & Developers**:
> Never manually craft, guess, or hand-edit generated schema tables, lockfiles, or migrations. Always use the official CLI tools. Manual changes desynchronize database state, introduce subtle typing bugs, and lead to silent runtime failures.

### 9.1 Dependency Management Standards (`npm` CLI)
- **Always Install via CLI**: Never manually type packages into `package.json`'s `dependencies` or `devDependencies` sections.
- **Latest Compatible Versions**:
  ```bash
  # Production dependencies
  npm install express@latest @prisma/client@latest better-auth@latest dotenv@latest zod@latest cors@latest

  # Development dependencies
  npm install -D typescript@latest prisma@latest @types/node@latest @types/express@latest @types/cors@latest tsx@latest
  ```
- **Integrity**: Running `npm install` directly ensures proper peer dependency resolution, updates `package-lock.json` with correct cryptographic hashes, and executes necessary build hooks.

### 9.2 Better Auth Schema & CLI Workflow (`@better-auth/cli`)
- **Never Hand-Code Better Auth Tables**: Better Auth plugin requirements (such as `Organization`, `Member`, `Session.activeOrganizationId`, `User.role`, etc.) change between versions.
- **CLI Generation Command**:
  ```bash
  # Automatically generate or update the Prisma schema based on auth.ts config and active plugins
  npx @better-auth/cli@latest generate
  ```
- **Mandatory Trigger**: Whenever `src/lib/auth.ts` is created or plugins are added/modified (e.g. `organization`, `admin`, `bearer`), agents **MUST run `npx @better-auth/cli@latest generate`** to let the CLI update `prisma/schema.prisma`.
- **Database Synchronization**:
  ```bash
  # Apply Better Auth schema changes via Prisma migrations
  npx prisma migrate dev --name init_better_auth
  ```

### 9.3 Prisma CLI Lifecycle & Database Migrations (`prisma` CLI)
- **Schema Validation & Formatting**:
  ```bash
  # Validate schema syntax and relations before attempting migration
  npx prisma validate

  # Format schema automatically according to Prisma conventions
  npx prisma format
  ```
- **Generating Migrations**:
  ```bash
  # Create a version-controlled, atomic SQL migration file and apply it to the database
  npx prisma migrate dev --name <descriptive_name>
  ```
  *(Never use `prisma db push` as a substitute for migrations in development, as it bypasses version-controlled migration history).*
- **Regenerating Prisma Client**:
  ```bash
  # Must be executed every time schema.prisma is updated
  npx prisma generate
  ```
- **Checking Migration Health**:
  ```bash
  npx prisma migrate status
  ```

### 9.4 Compile-Time & Static Verification (`tsc` / ESLint)
- **Zero-Error Compilation Standard**:
  Before claiming any feature is complete, verify clean TypeScript compilation:
  ```bash
  npx tsc --noEmit
  ```
- **Linting & Code Formatting**:
  ```bash
  npm run lint
  ```

### 9.5 Summary Checklist of Forbidden AI Agent Anti-Patterns

| Anti-Pattern (FORBIDDEN) | Standard CLI Practice (REQUIRED) |
| :--- | :--- |
| Hand-editing `package.json` to insert libraries | Run `npm install <package>@latest` or `npm install -D <package>@latest` |
| Manually writing Better Auth schema models in `schema.prisma` | Run `npx @better-auth/cli@latest generate` |
| Modifying database tables via raw SQL or ad-hoc DB GUI tools | Run `npx prisma migrate dev --name <migration_name>` |
| Modifying `schema.prisma` without regenerating client | Run `npx prisma generate` immediately after schema changes |
| Assuming code compiles without terminal verification | Run `npx tsc --noEmit` to verify type safety |

---

## 10. Verification & Testing Strategy

1. **Unit Testing**:
   - Zod validation schemas for all domain requests.
   - Pure functions for MCQ automatic scoring.
   - Score aggregation logic (`totalScore = autoScore + manualScore`).

2. **Integration Testing**:
   - Better Auth user signup, signin, and organization creation.
   - Company Admin inviting a Recruiter via the `organization` plugin.
   - Recruiter creating problems and building an assessment.
   - Candidate signup $\rightarrow$ token verification $\rightarrow$ timed attempt $\rightarrow$ answer submission.
   - Recruiter evaluation $\rightarrow$ scoring $\rightarrow$ scorecard generation.
   - Negative security tests: mismatched candidate email, late submission rejection, cross-tenant data access attempts.

---

## 11. Summary & Sign-off

This updated specification provides a modern, production-grade architecture:
- **Zero custom auth boilerplate**: Better Auth natively handles sessions, password hashing, and tokens with the `bearer` plugin.
- **True Multi-Tenancy**: Built-in `organization` plugin models companies and team roles (`admin`, `recruiter`).
- **Strict Candidate Access (Option B)**: Candidates are verified platform users linked directly to attempts.
- **Clean Hybrid Evaluation**: MCQ auto-grading + Recruiter review queue for coding and written questions without requiring code sandbox runners.
- **Strict CLI-First Discipline**: Standardizes on `npm`, `@better-auth/cli`, and `prisma` CLI workflows to eliminate schema drift and compilation discrepancies.
