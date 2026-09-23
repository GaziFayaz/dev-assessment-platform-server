---
title: Reports & Analytics Module - Plan
type: feat
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
origin: docs/backend-requirements-and-architecture.md
execution: code
---

## Goal Capsule

- Objective: Implement the Reports & Analytics module enabling Recruiters and Company Admins to inspect aggregate assessment performance metrics and detailed candidate scorecards, while providing authenticated candidates with a privacy-scrubbed view of their completed assessment results, complete with code-first OpenAPI 3.1 documentation and automated E2E verification.
- Authority Hierarchy:
  1. Primary Specification (`docs/backend-requirements-and-architecture.md`)
  2. Agent Guidelines (`AGENTS.md`)
  3. This Plan (`docs/plans/reports-analytics-module.md`)
- Execution Profile: `code`
- Stop Conditions: Stop and request feedback if changes to `prisma/schema.prisma` are required or if Better Auth organization roles conflict with tenant guards.
- Tail Ownership: Automated documentation validation (`npm run docs:validate`), TypeScript compilation (`npx tsc --noEmit`), seed verification (`npm run prisma:seed`), and E2E verification (`npm run test:reports`).

---

## Product Contract

### Summary
The Reports & Analytics module provides the terminal observability layer for the Developer Assessment Platform. It synthesizes candidate submissions, automated MCQ grading, and human rubric evaluations into comprehensive performance analytics. Recruiters and Company Administrators gain cohort-level insights into assessment efficacy (pass rates, score distribution histograms, question difficulty benchmarks) and granular candidate scorecards. Meanwhile, authenticated candidates (Option B) can review their verified scorecards and constructive evaluator feedback without leaking proprietary assessment rubrics or MCQ answer keys.

### Problem Frame
Recruiters and hiring managers need actionable data to evaluate candidate cohorts and tune assessment difficulty. Simple pass/fail status is insufficient for hiring decisions; teams require granular metrics such as score percentiles, average completion times, and question-level discrimination metrics. Furthermore, candidates require feedback on their performance for a transparent assessment experience. However, exposing evaluation details directly to candidates risks leaking proprietary evaluation rubrics, reviewer internal notes, and question answer keys. The backend must enforce a strict persona-segregated projection boundary that delivers rich scorecards to hiring teams while safeguarding test integrity for candidates.

### Requirements

#### Assessment Summary & Cohort Analytics
- R1. Authorized company members (`COMPANY_ADMIN`, `RECRUITER`) can retrieve aggregate performance analytics for an assessment via `GET /api/v1/reports/assessments/:id/summary`.
- R2. The assessment summary endpoint must verify tenant ownership (`assessment.organizationId === req.organizationId`), returning HTTP 404 Not Found if missing or unauthorized.
- R3. The response must project assessment overview metadata:
  - `assessmentId`, `title`, `status`, `durationMinutes`, `passingScore`, `totalScore`.
- R4. The response must aggregate participant cohort metrics:
  - `totalInvitations`: total count of dispatched candidate invitations.
  - `totalAttempts`: total count of candidate attempts across all statuses.
  - `attemptsByStatus`: itemized counts for `IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`, `UNDER_REVIEW`, and `COMPLETED`.
- R5. The response must calculate candidate performance metrics computed across all `COMPLETED` attempts:
  - `completedCandidates`: count of evaluated/completed attempts.
  - `passedCount`: count where `isPassed === true`.
  - `failedCount`: count where `isPassed === false`.
  - `passRate`: `(passedCount / completedCandidates) * 100` rounded to 1 decimal place (or `0.0` if 0 completed).
  - `averageScore`: arithmetic mean of `totalScore`.
  - `medianScore`: median value of `totalScore`.
  - `highestScore`: maximum recorded `totalScore`.
  - `lowestScore`: minimum recorded `totalScore`.
  - `averagePercentage`: arithmetic mean of candidate percentages.
- R6. The response must provide a score distribution histogram across 5 percentage tiers:
  - `0-20%`, `21-40%`, `41-60%`, `61-80%`, and `81-100%`, reporting candidate count and percentage share per bucket.
- R7. The response must provide question-level performance benchmarks for every problem attached to the assessment (ordered by `orderIndex ASC`):
  - `problemId`, `orderIndex`, `title`, `type`, `difficulty`, `allocatedPoints`.
  - `averageAwardedPoints`: average points awarded for this problem across completed attempts.
  - `accuracyRate`: for `MCQ_SINGLE` and `MCQ_MULTIPLE`, percentage of candidates who answered 100% correctly (`isCorrect === true`).

#### Detailed Candidate Attempt Scorecard (Recruiter / Admin View)
- R8. Authorized company members (`COMPANY_ADMIN`, `RECRUITER`) can retrieve a granular candidate scorecard via `GET /api/v1/reports/attempts/:attemptId`.
- R9. The attempt scorecard endpoint must verify tenant ownership (`attempt.assessment.organizationId === req.organizationId`), returning HTTP 404 Not Found if unauthorized or missing.
- R10. If the attempt has status `IN_PROGRESS`, the endpoint must return HTTP 400 Bad Request (`"Attempt is still in progress; scorecard is available only for submitted or completed attempts"`).
- R11. The recruiter scorecard response must include:
  - Candidate identity: `candidateId`, `candidateName`, `candidateEmail`.
  - Assessment identity: `assessmentId`, `assessmentTitle`, `durationMinutes`, `passingScore`, `totalPossibleScore`.
  - Timing metrics: `startedAt`, `submittedAt`, `durationTakenMinutes` (`Math.round((submittedAt - startedAt) / 60000)`).
  - Score summary: `autoScore`, `manualScore`, `totalScore`, `percentage`, `passingScore`, `isPassed`, `evaluationStatus`.
  - Evaluator details: `evaluatorName`, `evaluatorEmail`, `evaluatedAt`, and `overallFeedback` from `EvaluationReview`.
  - Itemized question breakdown (ordered by `orderIndex ASC`):
    - Problem title, type, difficulty, allocated points, description.
    - Candidate submitted response (`selectedOptions` for MCQ, `writtenAnswer` for Written, `submittedCode` & `selectedLanguage` for Coding).
    - For MCQs: candidate's selected options, full option list with `isCorrect` flags visible to reviewer, awarded `autoScore`, and `isCorrect` status.
    - For Subjective (`WRITTEN`/`CODING`): question `evaluationRubric`, awarded points, max points, and reviewer inline feedback (`EvaluationScore.feedback`).

#### Candidate Self-Service Scorecard (Candidate View)
- R12. Authenticated candidates can inspect their own completed assessment results via `GET /api/v1/reports/candidate/my-results`.
- R13. The candidate endpoint requires an active Better Auth session (`requireAuth`), scoped strictly to `candidateId === req.user.id` (or `candidateEmail === req.user.email`). No organization context header is required.
- R14. The query must return attempts where status is `COMPLETED` (optionally displaying `UNDER_REVIEW` / `SUBMITTED` as pending results without score details).
- R15. Anti-Cheating & Privacy Scrubbing:
  - Candidate view strictly scrubs all internal `evaluationRubric` definitions.
  - Candidate view scrubs correct answer indicators (`isCorrect: true` on option choices) for MCQs to protect assessment integrity for future cohorts.
  - Candidate view returns candidate-safe details: assessment title, organization name, completion date, their `totalScore`, `totalPossibleScore`, `percentage`, `isPassed`, `overallFeedback`, and question-level feedback from reviewers so candidates can learn from their assessment.

#### Multi-Tenancy & Authorization Boundaries
- R16. `GET /api/v1/reports/assessments/:id/summary` and `GET /api/v1/reports/attempts/:attemptId` require `requireAuth` and `requireCompanyRole(["admin", "recruiter"])`, strictly filtering via `req.organizationId`.
- R17. `GET /api/v1/reports/candidate/my-results` requires `requireAuth` for any registered candidate account.

#### Documentation & Verification
- R18. 100% of endpoints in the Reports & Analytics module must be registered in the shared OpenAPI registry (`src/lib/openapi.ts`) using `@asteasolutions/zod-to-openapi` with standard success (`200`) and error (`400`, `401`, `403`, `404`, `422`, `500`) schemas.
- R19. Comprehensive automated E2E verification test script at `src/scripts/test-reports-e2e.ts` runnable via `npm run test:reports`.

### Scope Boundaries
- In Scope: Assessment cohort performance metrics, median and distribution calculation, detailed recruiter candidate scorecards, candidate-safe self-service scorecards, OpenAPI 3.1 documentation, route wiring, and automated E2E verification test.
- Out of Scope / Deferred:
  - PDF/CSV report generation / export (deferred to future milestone).
  - Cross-organization platform benchmarking (deferred to Platform Admin module).
  - Plagiarism / code similarity detection algorithms.

---

## Planning Contract

### Key Technical Decisions
- KTD1. **Layered Architecture Consistency**: Build the module in `src/modules/report/` adhering to the established 5-layer pattern:
  - `report.schema.ts`: Zod request/response schemas, OpenAPI path definitions registered under `Reports` tag.
  - `report.repository.ts`: Encapsulated Prisma queries for aggregation metrics, attempt relationships, and candidate history.
  - `report.service.ts`: Analytics calculations (median, distribution buckets, pass rates), data privacy scrubbing, error throwing.
  - `report.controller.ts`: Express handlers mapping HTTP transactions to standard envelopes (`ApiResponse`).
  - `report.routes.ts`: Router mounting recruiter endpoints with `requireCompanyRole(["admin", "recruiter"])` and candidate endpoints with `requireAuth`.
- KTD2. **Dual-Persona Route Mounting**: Mount all report endpoints under `/api/v1/reports` in `src/routes/index.ts`:
  - Recruiter/Admin paths: `/reports/assessments/:id/summary` and `/reports/attempts/:attemptId` enforce `requireCompanyRole(["admin", "recruiter"])` + `x-organization-id`.
  - Candidate path: `/reports/candidate/my-results` enforces only `requireAuth` (external candidates do not hold organization memberships).
- KTD3. **Accurate Statistical Aggregations**:
  - Implement a pure statistical utility calculating `average`, `median`, `highest`, `lowest`, and score distribution buckets.
  - Median handles both odd and even dataset lengths correctly.
  - Distribution divides percentage into 5 discrete ranges: `0-20%`, `21-40%`, `41-60%`, `61-80%`, `81-100%`.
- KTD4. **Strict Persona-Segregated DTO Projections**:
  - `CandidateScorecardResponse`: includes `evaluationRubric`, full MCQ option lists with `isCorrect`, and internal evaluator identity for hiring managers.
  - `CandidateSelfResultsResponse`: strictly omits `evaluationRubric` and hides `isCorrect` on option items, exposing only the candidate's own submitted answers, points awarded, and educational feedback.
- KTD5. **Zero-Drift Code-First OpenAPI Registration**: Register all 3 endpoints in `src/lib/openapi.ts` using `@asteasolutions/zod-to-openapi` with standard response envelopes `createApiResponseSchema(DataSchema)` and error envelopes `ApiErrorResponseSchema`.

---

## High-Level Technical Design

### Reporting Data Flow
```mermaid
flowchart TD
    subgraph Client Requests
        R1["Recruiter / Admin"] -->|"GET /reports/assessments/:id/summary"| C_SUM["reportController.getAssessmentSummary"]
        R2["Recruiter / Admin"] -->|"GET /reports/attempts/:attemptId"| C_ATT["reportController.getAttemptReport"]
        C1["Candidate"] -->|"GET /reports/candidate/my-results"| C_MY["reportController.getCandidateResults"]
    end

    subgraph Service & Aggregation Layer
        C_SUM --> S_SUM["reportService.getAssessmentSummary"]
        C_ATT --> S_ATT["reportService.getAttemptReport"]
        C_MY --> S_MY["reportService.getCandidateResults"]

        S_SUM --> CALC["Statistical Engine: Mean, Median, Buckets, Question Difficulty"]
        S_ATT --> REC_DTO["Full Recruiter Scorecard DTO with Rubrics"]
        S_MY --> CAN_DTO["Candidate-Safe Scrubbed DTO (No Rubrics / Keys)"]
    end

    subgraph Database Layer (Prisma)
        S_SUM --> REPO["reportRepository"]
        S_ATT --> REPO
        S_MY --> REPO

        REPO --> DB_ASS["Assessment & AssessmentProblem"]
        REPO --> DB_ATT["AssessmentAttempt & SubmissionAnswer"]
        REPO --> DB_REV["EvaluationReview & EvaluationScore"]
    end
```

---

## Implementation Units

### U1. Report Validation Schemas & OpenAPI Registry
- **Goal**: Define Zod schemas for assessment summary analytics, detailed recruiter attempt scorecards, candidate personal results, and register OpenAPI 3.1 endpoints.
- **Requirements**: Covers R1, R3, R4, R5, R6, R7, R8, R11, R12, R15, R18.
- **Files**:
  - `src/modules/report/report.schema.ts`
- **Approach**:
  - Define `AssessmentSummaryParamsSchema`: `{ id: z.string().uuid() }`.
  - Define `AttemptReportParamsSchema`: `{ attemptId: z.string().uuid() }`.
  - Define `AssessmentSummaryResponseSchema`:
    - Assessment overview, invitation counts, attempt counts by status.
    - Performance stats: `completedCandidates`, `passedCount`, `failedCount`, `passRate`, `averageScore`, `medianScore`, `highestScore`, `lowestScore`, `averagePercentage`.
    - Score distribution buckets: array of `{ bucket: string, count: number, percentage: number }`.
    - Question performance array: `{ problemId, orderIndex, title, type, difficulty, allocatedPoints, averageAwardedPoints, accuracyRate }`.
  - Define `RecruiterAttemptReportResponseSchema`:
    - Candidate info, assessment info, timings, total scores, evaluator details, and question-by-question breakdown with rubrics and candidate responses.
  - Define `CandidateResultsResponseSchema`:
    - Array of completed assessment scorecards with question statements, candidate answers, awarded scores, and reviewer feedback (rubrics scrubbed).
  - Register OpenAPI paths under tag `["Reports"]`:
    - `GET /reports/assessments/{id}/summary` (200, 401, 403, 404)
    - `GET /reports/attempts/{attemptId}` (200, 400, 401, 403, 404)
    - `GET /reports/candidate/my-results` (200, 401)
- **Verification**: `npm run docs:validate`.

### U2. Report Repository Layer
- **Goal**: Implement database operations isolating Prisma queries for report metrics, aggregations, and attempt details.
- **Requirements**: Covers R2, R4, R5, R7, R9, R13, R14, R16, R17.
- **Files**:
  - `src/modules/report/report.repository.ts`
- **Approach**:
  - `findAssessmentWithProblems(assessmentId, organizationId)`: fetch assessment, attached problems (ordered by `orderIndex`), and invitation count.
  - `findAttemptsForAssessment(assessmentId)`: fetch all attempts for assessment with status, scores, and candidate details.
  - `findAttemptDetailedById(attemptId, organizationId)`: fetch single attempt with candidate, assessment, submission answers (with problem details and evaluation scores), and evaluation review with evaluator details.
  - `findCompletedAttemptsByCandidate(candidateId, candidateEmail)`: fetch completed attempts for candidate with assessment, organization branding, submission answers, and evaluation review.
- **Verification**: `npx tsc --noEmit`.

### U3. Report Service Layer
- **Goal**: Implement business logic, tenant validation, statistical aggregation functions, and candidate data projection.
- **Requirements**: Covers R2, R4, R5, R6, R7, R9, R10, R11, R13, R14, R15, R16, R17.
- **Files**:
  - `src/modules/report/report.service.ts`
- **Approach**:
  - `getAssessmentSummary(assessmentId, organizationId)`:
    - Verify assessment belongs to organization (throw 404 if not found).
    - Query attempts; group counts by status.
    - Filter completed attempts: compute average, median, highest, lowest scores and percentages.
    - Compute score distribution across 5 buckets.
    - For each problem: compute average points awarded and MCQ accuracy rates.
  - `getAttemptReport(attemptId, organizationId)`:
    - Verify attempt belongs to organization (throw 404 if not found).
    - If status is `IN_PROGRESS`, throw `AppError.badRequest("Attempt is still in progress")`.
    - Format full recruiter scorecard with timing calculations, evaluator feedback, and itemized question scoring.
  - `getCandidateResults(candidateId, candidateEmail)`:
    - Query completed attempts for candidate.
    - Transform records into candidate-safe DTOs: strip `evaluationRubric` and MCQ `isCorrect` option attributes.
- **Verification**: `npx tsc --noEmit`.

### U4. Report Controller & Express Route Integration
- **Goal**: Expose report endpoints, apply auth/tenant middlewares, mount in Express router, and register in API router.
- **Requirements**: Covers R1, R8, R12, R16, R17.
- **Files**:
  - `src/modules/report/report.controller.ts`
  - `src/modules/report/report.routes.ts`
  - `src/routes/index.ts`
- **Approach**:
  - Implement `report.controller.ts` with handlers returning `createApiResponseSchema` envelopes.
  - Implement `report.routes.ts`:
    - Recruiter endpoints protected with `requireAuth`, `requireCompanyRole(["admin", "recruiter"])`, and `validateRequest`.
    - Candidate endpoint protected with `requireAuth`.
  - Uncomment and mount `reportRouter` in `src/routes/index.ts` under `/reports`.
- **Verification**: `npm run docs:validate` and `npx tsc --noEmit`.

### U5. Reports E2E Verification Test Suite & Package Script
- **Goal**: Build automated end-to-end verification script testing all report endpoints against real seeded database transactions.
- **Requirements**: Covers R18, R19.
- **Files**:
  - `src/scripts/test-reports-e2e.ts`
  - `package.json`
- **Approach**:
  - Spin up Express test server (`app.listen(0)`).
  - Verify unauthenticated calls return 401 Unauthorized.
  - Authenticate as Recruiter (`recruiter@techcorp.dev`):
    - Test `GET /api/v1/reports/assessments/:id/summary` for seeded assessment; assert summary counts, pass rate, distribution buckets, and question breakdown.
    - Test `GET /api/v1/reports/attempts/:attemptId` for completed attempt; assert scores, rubrics, and evaluator feedback.
    - Test attempt report for non-existent / unauthorized attempt (assert 404).
  - Authenticate as Candidate (`alice@candidate.dev`):
    - Test `GET /api/v1/reports/candidate/my-results`; assert candidate sees completed attempts, but rubrics and MCQ answer keys are scrubbed.
    - Verify candidate cannot access recruiter assessment summary (403 Forbidden).
  - Add `"test:reports": "tsx src/scripts/test-reports-e2e.ts"` to `package.json`.
- **Verification**: `npm run test:reports`.

---

## Verification Contract

| Check / Command | Type | Target / Success Criteria |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | Static Typecheck | Zero compilation errors across all modules and scripts |
| `npm run docs:validate` | Contract Integrity | All 3 report endpoints registered and OpenAPI 3.1 builds without error |
| `npm run test:reports` | E2E Integration | Full pass for assessment summary, recruiter scorecard, and candidate results |

---

## Definition of Done

- All 3 report endpoints (`GET /assessments/:id/summary`, `GET /attempts/:attemptId`, `GET /candidate/my-results`) implemented and mounted at `/api/v1/reports`.
- Statistical analytics engine correctly calculates pass rate, mean, median, min/max, distribution histogram, and per-question accuracy.
- Persona-segregated projections strictly protect assessment integrity by scrubbing rubrics and answer keys for candidates.
- Multi-tenancy strictly enforced on recruiter endpoints via `x-organization-id`.
- 100% OpenAPI documentation parity verified by `npm run docs:validate`.
- Automated test script `src/scripts/test-reports-e2e.ts` executed and passing via `npm run test:reports`.
- `npx tsc --noEmit` runs with 0 errors.

