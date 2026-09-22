---
title: Candidate Attempt Engine Module - Plan
type: feat
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
origin: docs/backend-requirements-and-architecture.md
execution: code
---

## Goal Capsule

- Objective: Implement the Candidate Attempt Engine module enabling authenticated candidates (Option B) to initiate timed assessment sessions, stream answers with autosave drafts, enforce server-authoritative countdown timers, automatically grade MCQs upon submission, transition sessions into the evaluation queue or completed status, and guarantee zero leakage of answer keys and rubrics.
- Authority Hierarchy:
  1. Primary Specification (`docs/backend-requirements-and-architecture.md`)
  2. Agent Guidelines (`AGENTS.md`)
  3. This Plan (`docs/plans/candidate-attempt-engine-module.md`)
- Execution Profile: `code`
- Stop Conditions: Stop and request feedback if changes to `prisma/schema.prisma` are required or if Better Auth session structures conflict with candidate authentication guards.
- Tail Ownership: Automated documentation validation (`npm run docs:validate`), TypeScript compilation (`npx tsc --noEmit`), seed execution (`npm run prisma:seed`), and E2E verification (`npm run test:attempts`).

---

## Product Contract

### Summary
The Candidate Attempt Engine provides the core test-taking environment for the Developer Assessment Platform. Following the platform's mandatory candidate account model (Option B), authenticated candidates launch time-bounded assessment sessions via their verified invitation tokens. The engine governs the session lifecycle (`IN_PROGRESS` $\rightarrow$ `SUBMITTED` / `AUTO_SUBMITTED` $\rightarrow$ `UNDER_REVIEW` / `COMPLETED`), ensures submission immutability, autosaves answer drafts, executes immediate deterministic grading for single and multiple-choice MCQs, and securely projects candidate-safe question DTOs without leaking answer keys or grading rubrics.

### Problem Frame
Technical assessments require strict test integrity, precise timekeeping, and foolproof anti-cheating protections. In browser-based testing, client-side timers cannot be trusted; timer expiration must be server-authoritative. Furthermore, network hiccups or browser refreshes should not wipe a candidate's draft answers or lock them out of an in-progress session. When candidates submit their attempts (or when the timer runs out), the system must instantly grade objective questions (MCQs), route subjective questions (coding challenges and written essays) to the human evaluation queue, and prevent any subsequent mutation of submitted answers.

### Requirements

#### Attempt Initiation & Verification (Option B Gate)
- R1. An authenticated candidate can start an assessment attempt via `POST /api/v1/attempts/start` with payload `{ inviteToken: string }`.
- R2. Attempt initiation must verify:
  - The `inviteToken` exists in `CandidateInvitation` (HTTP 404 if not found).
  - The authenticated user's email (`req.user.email`) matches `CandidateInvitation.candidateEmail` case-insensitively (HTTP 403 Forbidden if mismatched).
  - The invitation is not expired (`expiresAt > NOW()`, HTTP 410 Gone if expired).
  - The parent assessment is `PUBLISHED` or `ACTIVE` (HTTP 409 Conflict if `DRAFT`, `CLOSED`, or `ARCHIVED`).
  - Current time is within the assessment's validity window (`validFrom` and `validUntil`) if configured (HTTP 409 Conflict if window is closed or not yet open).
- R3. Re-entry & Idempotency:
  - If the candidate already has an `IN_PROGRESS` attempt for this invitation and the server timer has not expired, return HTTP 200 OK with the existing attempt data, resume state, and remaining seconds.
  - If the existing attempt has expired, trigger auto-submission and return HTTP 409 Conflict (`"Assessment attempt has expired and was auto-submitted"`).
  - If the candidate's attempt is already `SUBMITTED`, `AUTO_SUBMITTED`, `UNDER_REVIEW`, or `COMPLETED`, reject with HTTP 409 Conflict (`"Assessment attempt has already been submitted"`).
- R4. When creating a new attempt:
  - Create an `AssessmentAttempt` record with `status: IN_PROGRESS`, `startedAt: NOW()`, `candidateId: req.user.id`, `candidateEmail: req.user.email`.
  - Calculate `expiresAt` as `NOW() + (assessment.durationMinutes * 60 * 1000) + (60 * 1000)` (including a 60-second network grace period).
  - Set `evaluationStatus` to `PENDING` if the assessment contains any `WRITTEN` or `CODING` questions, or `NOT_REQUIRED` if 100% MCQs.
  - Update `CandidateInvitation.isAccepted = true`.

#### Session Inspection & Server-Authoritative Timer
- R5. Authenticated candidates can inspect their attempt session via `GET /api/v1/attempts/:attemptId`.
- R6. Access control: The endpoint must verify `req.user.id === attempt.candidateId` (or recruiter/admin belonging to the assessment's organization). Unauthorized users receive HTTP 403 Forbidden.
- R7. Server-Authoritative Timer Check:
  - If the attempt is `IN_PROGRESS` and `NOW() > attempt.expiresAt`, the server must automatically finalize the attempt (`status: AUTO_SUBMITTED`), execute MCQ auto-grading, and route to the evaluation queue or completed state.
- R8. Calculate and return `remainingSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))`.

#### Answer Draft Autosaving
- R9. Candidates can autosave answer drafts via `PUT /api/v1/attempts/:attemptId/answers`.
- R10. Request payload supports:
  - `problemId`: UUID of the question being answered.
  - `selectedOptions`: string array of chosen option IDs (for `MCQ_SINGLE` and `MCQ_MULTIPLE`).
  - `writtenAnswer`: text string (for `WRITTEN`).
  - `submittedCode`: code string (for `CODING`).
  - `selectedLanguage`: string identifier (e.g. `javascript`, `typescript`, `python`).
- R11. Mutation guards:
  - Reject with HTTP 403 Forbidden if `req.user.id !== attempt.candidateId`.
  - Reject with HTTP 409 Conflict if attempt status is not `IN_PROGRESS` (submission immutability).
  - Reject with HTTP 409 Conflict if `NOW() > attempt.expiresAt` (auto-submit expired attempt).
  - Reject with HTTP 400 Bad Request if `problemId` is not part of the assessment.
- R12. Upsert the `SubmissionAnswer` record keyed on `(attemptId, problemId)`, updating timestamp and answer contents.

#### Submission & MCQ Auto-Grading Engine
- R13. Candidates can finalize and submit their assessment via `POST /api/v1/attempts/:attemptId/submit`.
- R14. Submission guards:
  - Reject with HTTP 403 Forbidden if `req.user.id !== attempt.candidateId`.
  - Reject with HTTP 409 Conflict if attempt status is not `IN_PROGRESS`.
- R15. Execution & Scoring Logic:
  - Record `submittedAt = NOW()`.
  - Determine `status`: `AUTO_SUBMITTED` if `NOW() > attempt.expiresAt`, otherwise `SUBMITTED`.
  - **Automated MCQ Grading**:
    - For each `MCQ_SINGLE` or `MCQ_MULTIPLE` problem in the assessment:
      - Compare candidate's `SubmissionAnswer.selectedOptions` against correct option IDs (`isCorrect: true`) in `problem.mcqOptions`.
      - Exact set match (all correct options selected, no incorrect options selected): award full `points` allocated in `AssessmentProblem` and set `SubmissionAnswer.isCorrect = true`.
      - Mismatch or missing answer: award `0.0` points and set `SubmissionAnswer.isCorrect = false`.
      - Persist `autoScore` and `isCorrect` on `SubmissionAnswer`.
    - Sum all MCQ scores into `attempt.autoScore`.
  - **Evaluation Routing**:
    - If the assessment contains any `WRITTEN` or `CODING` questions:
      - Set `attempt.status = UNDER_REVIEW`.
      - Set `attempt.evaluationStatus = PENDING`.
      - Set `attempt.totalScore = attempt.autoScore` (pre-human evaluation total).
      - Set `attempt.percentage = 0.0` (pending review).
      - Set `attempt.isPassed = null`.
      - Create an `EvaluationReview` record (`attemptId: attempt.id`, `evaluationStatus: PENDING`).
    - If the assessment is 100% MCQs (no human review needed):
      - Set `attempt.status = COMPLETED`.
      - Set `attempt.evaluationStatus = NOT_REQUIRED`.
      - Set `attempt.manualScore = 0.0`.
      - Set `attempt.totalScore = attempt.autoScore`.
      - Calculate `percentage = assessment.totalScore > 0 ? (totalScore / assessment.totalScore) * 100 : 0.0`.
      - Calculate `isPassed = assessment.passingScore !== null ? totalScore >= assessment.passingScore : true`.
  - Return submission result DTO.

#### Candidate Data Projection & Anti-Cheating Scrubbing
- R16. All candidate-facing responses (`POST /start`, `GET /:id`, `POST /submit`) must strictly project sanitized problem definitions:
  - Scrub `isCorrect` from all `mcqOptions` items.
  - Scrub `evaluationRubric` from all problems.
  - Scrub hidden test cases from `codingDetails` (only `starterCode`, `allowedLanguages`, and `sampleIo` are projected).
  - Strip creator identity and internal administrative notes.

#### Seeding, Documentation & E2E Verification
- R17. The module must provide an idempotent feature seeder at `prisma/seeds/attempts.seed.ts` creating:
  - An `IN_PROGRESS` attempt for a test candidate.
  - An `UNDER_REVIEW` submitted attempt with mixed questions (MCQs + Coding).
  - A `COMPLETED` submitted attempt for a 100% MCQ assessment with computed score and pass status.
  - Registered inside `prisma/seed.ts`.
- R18. 100% of endpoints in the Candidate Attempt Engine must be registered in the OpenAPI registry (`src/lib/openapi.ts`) using `@asteasolutions/zod-to-openapi` under the `Attempts` tag.
- R19. Comprehensive automated E2E verification script at `src/scripts/test-attempts-e2e.ts` runnable via `npm run test:attempts`.

### Scope Boundaries
- In Scope: Attempt creation, Option B candidate account verification, session resumption, server-authoritative timer countdown, draft autosaving, MCQ auto-scoring, evaluation review routing, candidate-safe DTO projections, OpenAPI registration, seeding, and E2E verification.
- Out of Scope / Deferred:
  - Human reviewer scoring and feedback input (handled in Module 5: `evaluation`).
  - Scorecard reporting summaries and candidate analytics (handled in Module 6: `report`).
  - Browser anti-cheat telemetry / proctoring (webcam/tab-switch tracking - future milestone).

---

## Planning Contract

### Key Technical Decisions
- KTD1. **Layered Architecture Consistency**: Adhere strictly to the established 5-layer modular pattern under `src/modules/attempt/`:
  - `attempt.schema.ts`: Zod request/response schemas, OpenAPI path definitions, scrubbed candidate DTOs.
  - `attempt.repository.ts`: Encapsulated Prisma database operations for attempts, answers, and evaluation reviews.
  - `attempt.service.ts`: Business logic, Option B email validation, timer checks, MCQ auto-scoring algorithm, state transitions.
  - `attempt.controller.ts`: Express request handling, parameter extraction, standard `ApiResponse` envelopes.
  - `attempt.routes.ts`: Router mounted with `requireAuth` and `validateRequest`.
- KTD2. **Candidate Security Boundary**: Candidate endpoints require only `requireAuth` (an active Better Auth session). They do **not** require `requireCompanyRole` or `x-organization-id` headers because candidates are external test-takers, not members of the hiring organization.
- KTD3. **Zero-Leakage Question Projection**: Implement a dedicated `sanitizeProblemForCandidate` transformation utility. It takes raw database `Problem` and `AssessmentProblem` entities and strips `isCorrect` from every choice in `mcqOptions`, omits `evaluationRubric`, and exposes only public coding details.
- KTD4. **Deterministic MCQ Auto-Grading**: Implement pure function `gradeMcqAnswer(selectedOptions, problemOptions, points)`.
  - Extracts the exact set of option IDs where `isCorrect === true`.
  - Normalizes candidate `selectedOptions` into a sorted, de-duplicated array.
  - Compares lengths and sorted values. Exact match awards full problem points; any difference (extra options or missing options) yields 0 points.
- KTD5. **Server-Authoritative Timer & Grace Period**: Compute `expiresAt` upon attempt creation with `durationMinutes * 60 * 1000 + 60_000` (60s network grace period). In both `GET /:id` and `PUT /answers`, if `Date.now() > expiresAt`, immediately invoke the auto-submit procedure so expired attempts cannot be indefinitely extended or submitted out of time.
- KTD6. **Safe Resumption on Refresh**: If a candidate refreshes the page or re-calls `POST /api/v1/attempts/start` with the same valid token while their attempt is `IN_PROGRESS`, return the existing active attempt with current remaining time and saved answer drafts, guaranteeing zero data loss or double-spend of invitations.

---

## Implementation Units

### U1. Attempt Validation Schemas & OpenAPI Registry
- **Goal**: Define Zod schemas for attempt initiation, draft autosaving, session response DTOs, and register OpenAPI 3.1 paths in `src/lib/openapi.ts`.
- **Requirements**: Covers R1, R5, R8, R9, R10, R16, R18.
- **Files**:
  - `src/modules/attempt/attempt.schema.ts`
- **Approach**:
  - Define `StartAttemptBodySchema`: `{ inviteToken: z.string().min(1) }`.
  - Define `SaveAnswerBodySchema`: `{ problemId: z.string().uuid(), selectedOptions?: z.array(z.string()), writtenAnswer?: z.string(), submittedCode?: z.string(), selectedLanguage?: z.string() }`.
  - Define `AttemptIdParamSchema`: `{ attemptId: z.string().uuid() }`.
  - Define scrubbed candidate problem DTO `CandidateProblemResponseSchema` (`id`, `orderIndex`, `points`, `title`, `description`, `type`, `difficulty`, `mcqOptions` without `isCorrect`, `codingDetails` without rubrics).
  - Define `CandidateAttemptResponseSchema` (attempt metadata, remainingSeconds, sanitized questions, and candidate's saved answers).
  - Define `SubmitAttemptResponseSchema` (status, totalScore, percentage, isPassed if completed, submittedAt).
  - Register OpenAPI paths under tag `["Attempts"]`:
    - `POST /attempts/start` (200, 201, 400, 401, 403, 404, 409, 410)
    - `GET /attempts/{attemptId}` (200, 401, 403, 404)
    - `PUT /attempts/{attemptId}/answers` (200, 400, 401, 403, 404, 409)
    - `POST /attempts/{attemptId}/submit` (200, 401, 403, 404, 409)
- **Verification**: `npm run docs:validate`.

### U2. Attempt Repository Layer
- **Goal**: Implement encapsulated Prisma database access for `AssessmentAttempt`, `SubmissionAnswer`, and `EvaluationReview`.
- **Requirements**: Covers R1, R2, R4, R5, R6, R7, R12, R15.
- **Files**:
  - `src/modules/attempt/attempt.repository.ts`
- **Approach**:
  - `findInvitationByToken(token)`: fetch invitation with assessment and attached problems.
  - `findExistingAttempt(invitationId, candidateId)`: find attempt for candidate/invitation.
  - `createAttempt(data)`: persist new attempt and mark invitation accepted.
  - `findAttemptById(attemptId)`: fetch attempt with assessment, problems, and candidate answers.
  - `upsertAnswer(attemptId, problemId, data)`: upsert candidate's answer draft.
  - `updateAttemptStatusAndScores(attemptId, data)`: update status, scores, timestamps.
  - `createEvaluationReview(attemptId)`: initialize review queue record for subjective evaluation.
- **Verification**: `npx tsc --noEmit`.

### U3. Attempt Service Layer & Grading Engine
- **Goal**: Implement business rules, Option B email validation, server timer checks, MCQ auto-grading, and evaluation routing.
- **Requirements**: Covers R1, R2, R3, R4, R6, R7, R8, R11, R14, R15, R16.
- **Files**:
  - `src/modules/attempt/attempt.service.ts`
- **Approach**:
  - Implement `sanitizeProblemForCandidate(problem, orderIndex, points)` utility.
  - Implement `gradeMcq(selectedOptions, mcqOptions, points)` pure grading function.
  - Implement `startAttempt(userId, userEmail, inviteToken)`:
    - Validate invitation, email match (403 if mismatch), expiry (410 if expired), assessment status (409 if not active/published).
    - Handle resume if `IN_PROGRESS` attempt exists.
    - Check auto-submit if expired.
    - Create attempt, calculate `expiresAt` with grace period.
  - Implement `getAttempt(userId, attemptId)`:
    - Verify ownership. Check if timer expired; if so, trigger `executeSubmission(attempt, isAutoSubmit: true)`.
    - Return scrubbed questions, remaining time, and candidate answers.
  - Implement `saveAnswer(userId, attemptId, answerData)`:
    - Verify ownership, status `IN_PROGRESS`, and timer validity (auto-submit if expired).
    - Verify problem belongs to assessment.
    - Upsert `SubmissionAnswer`.
  - Implement `submitAttempt(userId, attemptId)` / `executeSubmission`:
    - Grade all MCQs.
    - Route to `UNDER_REVIEW` (if coding/written questions exist) or `COMPLETED` (if 100% MCQ).
    - Persist results and return confirmation.
- **Verification**: `npx tsc --noEmit`.

### U4. Attempt Controller & Express Route Integration
- **Goal**: Expose endpoints via Express router, integrate into `src/routes/index.ts`, and apply `requireAuth`.
- **Requirements**: Covers R1, R5, R9, R13.
- **Files**:
  - `src/modules/attempt/attempt.controller.ts`
  - `src/modules/attempt/attempt.routes.ts`
  - `src/routes/index.ts`
- **Approach**:
  - Implement `attempt.controller.ts` with handlers calling service methods and wrapping output in standard `ApiResponse` envelopes.
  - Build `attempt.routes.ts` with `requireAuth` and `validateRequest`.
  - Uncomment and mount `apiV1Router.use("/attempts", attemptRouter)` in `src/routes/index.ts`.
- **Verification**: `npm run docs:validate` and `npx tsc --noEmit`.

### U5. Modular Attempt Seeder
- **Goal**: Create idempotent seed data populating realistic candidate attempts (in-progress, submitted/under-review, and completed MCQ) and wire into master seed pipeline.
- **Requirements**: Covers R17.
- **Files**:
  - `prisma/seeds/attempts.seed.ts`
  - `prisma/seed.ts`
- **Approach**:
  - Use seeded candidates (`alice@candidate.dev`, `bob@candidate.dev`) and TechCorp assessments.
  - Seed 1: In-progress attempt for Alice on "Frontend Core Fundamentals".
  - Seed 2: Completed 100% MCQ attempt with auto-graded score and `isPassed: true`.
  - Seed 3: Submitted `UNDER_REVIEW` attempt on mixed assessment with linked `EvaluationReview`.
  - Register `seedAttempts` as step `[5/5]` in `prisma/seed.ts`.
- **Verification**: `npm run prisma:seed`.

### U6. Automated E2E Verification Script
- **Goal**: Create comprehensive automated test suite verifying the complete attempt lifecycle and anti-cheating security gates.
- **Requirements**: Covers R19.
- **Files**:
  - `src/scripts/test-attempts-e2e.ts`
  - `package.json`
- **Approach**:
  - Add `"test:attempts": "tsx src/scripts/test-attempts-e2e.ts"` to `package.json`.
  - Test unauthenticated rejection (401).
  - Test Option B security: start attempt with wrong candidate account (403 Forbidden).
  - Test start attempt with valid candidate account (201 Created, sanitized questions, NO `isCorrect` or rubrics).
  - Test attempt resume on repeated start call (200 OK, identical attempt ID).
  - Test timer calculation and `remainingSeconds`.
  - Test answer draft saving for MCQ and Coding problems (200 OK).
  - Test submission immutability: submitting attempt, then verifying subsequent `PUT /answers` fails with 409 Conflict.
  - Test MCQ auto-grading calculation: verify points match expected score.
  - Test review routing: verify mixed assessment transitions to `UNDER_REVIEW` with `EvaluationReview` created.
- **Verification**: `npm run test:attempts`.

---

## Verification Contract

| Check / Command | Type | Target / Success Criteria |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | Static Typecheck | Zero compilation errors across all modules and scripts |
| `npm run docs:validate` | Contract Integrity | All 4 attempt endpoints registered and valid in OpenAPI 3.1 spec |
| `npm run prisma:seed` | Data Pipeline | Master seeder runs idempotently and populates attempts & reviews |
| `npm run test:attempts` | E2E Integration | Full attempt lifecycle passes with 200/201 status codes and 401/403/409 security guards |

---

## Definition of Done

- All 4 candidate attempt endpoints implemented and mounted at `/api/v1/attempts`.
- Option B candidate email matching (`req.user.email === CandidateInvitation.candidateEmail`) strictly enforced.
- Server-authoritative timer countdown and auto-submission implemented.
- MCQ automatic scoring engine correctly grades single and multiple choice answers.
- Evaluation queue routing triggers for subjective questions (`UNDER_REVIEW` + `EvaluationReview`).
- 100% MCQ assessments complete immediately with calculated total score, percentage, and pass/fail.
- Sanitized question projection guarantees zero leakage of answer keys or rubrics.
- OpenAPI 3.1 documentation parity verified via `npm run docs:validate`.
- Modular seeder `prisma/seeds/attempts.seed.ts` integrated in `prisma/seed.ts`.
- `npm run test:attempts` passes all E2E verification checks.

