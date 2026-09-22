---
title: Assessment Builder Module - Plan
type: feat
date: 2026-09-22
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
origin: docs/backend-requirements-and-architecture.md
execution: code
---

## Goal Capsule

- Objective: Implement the Assessment Builder module providing multi-tenant management of developer assessments (drafting, problem assembly with points & order, status lifecycle state machine, attempt-guarded deletion, and scorecard parameters) with clean layered architecture, code-first OpenAPI 3.1 documentation, and idempotent seed data.
- Authority Hierarchy:
  1. Primary Specification (`docs/backend-requirements-and-architecture.md`)
  2. Agent Guidelines (`AGENTS.md`)
  3. This Plan (`docs/plans/assessment-builder-module.md`)
- Execution Profile: `code`
- Stop Conditions: Stop and request feedback if changes to `prisma/schema.prisma` are required or if Better Auth organization roles conflict with tenant guards.
- Tail Ownership: Automated documentation validation (`npm run docs:validate`), TypeScript compilation (`npx tsc --noEmit`), seed execution (`npm run prisma:seed`), and E2E verification (`npm run test:assessments`).

---

## Product Contract

### Summary
The Assessment Builder module enables Recruiters and Company Administrators to design structured evaluations by assembling questions from the organization's Problem Bank, configuring testing constraints (duration, passing score, instructions, validity windows), managing problem point weights, and governing the assessment lifecycle (`DRAFT` $\rightarrow$ `PUBLISHED` $\rightarrow$ `ACTIVE` $\rightarrow$ `CLOSED` $\rightarrow$ `ARCHIVED`). Assessments enforce referential integrity to prevent modifications once published or attempted by candidates.

### Problem Frame
Recruiters need to assemble assessments tailored to specific job roles and skill tiers by combining multiple question types (MCQs, coding challenges, essays). Each problem within an assessment may carry different weightings (points) and display sequence. To prevent unfair testing conditions or corrupted scores, question composition must be locked once an assessment is published or open for attempts. Furthermore, assessments with historical candidate submissions cannot be deleted, preserving audit trails and candidate performance records.

### Requirements

#### Assessment Configuration & Assembly
- R1. The system shall allow authorized company members (`COMPANY_ADMIN`, `RECRUITER`) to create draft assessments with title (3-200 chars), optional description, instructions (markdown), duration in minutes (5 to 1440), optional passing score, and optional validity window (`validFrom`, `validUntil`).
- R2. A newly created assessment must automatically record `creatorId = req.user.id`, `organizationId = req.organizationId`, `status = DRAFT`, and initial `totalScore = 0.0`.
- R3. Authorized company members can add problems to an assessment in `DRAFT` status via `POST /api/v1/assessments/:id/problems`. Each added problem specifies `problemId`, allocated `points` (> 0, defaulting to problem's `defaultPoints`), and optional `orderIndex`.
- R4. If `orderIndex` is omitted when attaching a problem, the system automatically assigns `max(existing orderIndex) + 1` (starting at 1).
- R5. Attaching a problem must verify that the problem belongs to the same organization (or is a platform-wide problem) and is not already attached to this assessment (`assessmentId_problemId` uniqueness).
- R6. Attaching or removing a problem must automatically recalculate and update the assessment's `totalScore` as the sum of all associated `AssessmentProblem.points`.
- R7. Authorized company members can remove a problem from an assessment in `DRAFT` status via `DELETE /api/v1/assessments/:id/problems/:problemId`, automatically updating `totalScore`.
- R8. Modifying assessment problem associations (adding or removing) must be strictly forbidden (HTTP 409 Conflict) if the assessment status is NOT `DRAFT`.

#### Assessment Lifecycle & State Machine
- R9. Assessment status transitions must be controlled via `PATCH /api/v1/assessments/:id/status` adhering to a strict state machine:
  - `DRAFT` $\rightarrow$ `PUBLISHED`: Requires at least one problem attached (`AssessmentProblem` count > 0), `totalScore > 0`, and if `passingScore` is defined, `passingScore <= totalScore`.
  - `PUBLISHED` $\rightarrow$ `ACTIVE`: Opens the assessment for candidate attempts.
  - `ACTIVE` $\rightarrow$ `CLOSED`: Closes the assessment; no new candidate attempts may be started.
  - Any status $\rightarrow$ `ARCHIVED`: Deprecates the assessment from active listings.
- R10. Any invalid state transition (e.g. `CLOSED` $\rightarrow$ `DRAFT` when attempts exist, or `DRAFT` $\rightarrow$ `ACTIVE` directly) must be rejected with HTTP 400 Bad Request or HTTP 409 Conflict with descriptive messages.

#### Querying & Mutation Governance
- R11. Listing assessments (`GET /api/v1/assessments`) shall support pagination (`page`, `limit`), filtering by `status`, and text search over `title` and `description`.
- R12. Assessment listing must return summary metrics: problem count (`_count.problems`), invitation count (`_count.invitations`), and attempt count (`_count.attempts`) within the standard `ApiPaginatedResponse<T>` envelope.
- R13. Inspecting a single assessment (`GET /api/v1/assessments/:id`) must return the full assessment configuration, including all attached problems ordered by `orderIndex ASC` with their allocated points, titles, types, difficulties, statement descriptions, and rubrics.
- R14. Updating assessment metadata (`PUT /api/v1/assessments/:id`) shall allow modifying title, description, instructions, duration, passing score, and scheduling dates. If the assessment status is `CLOSED` or `ARCHIVED`, updates must be rejected with 409 Conflict. If `passingScore` is updated, it must not exceed `totalScore` (when `totalScore > 0`).
- R15. Deleting an assessment (`DELETE /api/v1/assessments/:id`) must verify whether any candidate attempts exist (`AssessmentAttempt` count > 0). If attempts exist, deletion must be rejected with 409 Conflict (advising archiving instead). If zero attempts exist, the assessment and its draft problem attachments can be safely deleted.

#### Multi-Tenancy & Authorization
- R16. All assessment endpoints (`/api/v1/assessments/*`) shall require an authenticated user session (`requireAuth`) and membership in the tenant organization with an `admin` (`COMPANY_ADMIN`) or `recruiter` (`RECRUITER`) role (`requireCompanyRole(["admin", "recruiter"])`).
- R17. All database operations must strictly enforce tenant isolation using `organizationId = req.organizationId`.

#### Seeding & Documentation
- R18. The module must provide an idempotent feature seeder at `prisma/seeds/assessments.seed.ts` populating diverse test assessments for the demo organization `techcorp` (attaching seeded problems, establishing DRAFT, PUBLISHED, and ACTIVE assessments), registered inside `prisma/seed.ts`.
- R19. 100% of endpoints in the Assessment Builder module must be registered in the OpenAPI registry (`src/lib/openapi.ts`) using `@asteasolutions/zod-to-openapi` with standard success (`200`, `201`) and error (`400`, `401`, `403`, `404`, `409`, `422`, `500`) responses.

### Scope Boundaries
- In Scope: Assessment CRUD operations, problem assembly with points & orderIndex, totalScore automatic synchronization, lifecycle status transitions, attempt guards, OpenAPI 3.1 contract registration, and modular seeding.
- Out of Scope / Deferred:
  - Sending candidate invitations (handled in Module 3: `invitation`).
  - Candidate session attempt initiation and countdown enforcement (handled in Module 4: `attempt`).
  - Scorecard grading and report analytics (handled in Modules 5 and 6).

---

## Planning Contract

### Key Technical Decisions
- KTD1. **Layered Architecture Consistency**: Adhere strictly to the established 5-layer modular pattern under `src/modules/assessment/`:
  - `assessment.schema.ts`: Zod request/response schemas, OpenAPI path definitions, status enum validators.
  - `assessment.repository.ts`: Encapsulated Prisma database operations scoped by `organizationId`.
  - `assessment.service.ts`: Business logic, status state transitions, totalScore recomputation, problem verification.
  - `assessment.controller.ts`: Express request extraction, delegation, standard JSON envelopes.
  - `assessment.routes.ts`: Router mounting with `requireAuth`, `requireCompanyRole(["admin", "recruiter"])`, `validateRequest`.
- KTD2. **Atomic TotalScore Recalculation**: Whenever problems are added or removed, recalculate `totalScore` inside an atomic Prisma transaction (`$transaction`) or compute the aggregate sum and update the parent assessment record, preventing drift between individual problem points and assessment `totalScore`.
- KTD3. **Strict Status State Machine**: Formalize valid status transitions in a transition map constant:
  - `DRAFT` $\rightarrow$ `['PUBLISHED', 'ARCHIVED']`
  - `PUBLISHED` $\rightarrow$ `['ACTIVE', 'ARCHIVED']`
  - `ACTIVE` $\rightarrow$ `['CLOSED', 'ARCHIVED']`
  - `CLOSED` $\rightarrow$ `['ARCHIVED']`
  - `ARCHIVED` $\rightarrow$ `[]`
  Pre-transition validation hooks verify business invariants (e.g. `PUBLISHED` requires problems > 0 and `passingScore <= totalScore`).
- KTD4. **Automatic Order Index Handling**: When adding a problem, if `orderIndex` is not supplied by the caller, compute `(current max orderIndex) + 1` to ensure predictable sequencing without requiring manual client tracking.
- KTD5. **Safe Idempotent Seeder**: In `prisma/seeds/assessments.seed.ts`, identify assessments by unique `slug` or `title` + `organizationId`, create or update records, connect existing problems seeded by `problems.seed.ts`, and compute exact points.

---

## Implementation Units

### U1. Assessment Validation Schemas & OpenAPI Registry
- **Goal**: Define Zod schemas for all assessment operations and register 7 OpenAPI 3.1 endpoints in the global OpenAPI registry.
- **Requirements**: Covers R1, R3, R4, R9, R11, R14, R19.
- **Files**:
  - `src/modules/assessment/assessment.schema.ts`
- **Approach**:
  - Define `AssessmentStatusEnum`: `["DRAFT", "PUBLISHED", "ACTIVE", "CLOSED", "ARCHIVED"]`.
  - Define `CreateAssessmentBodySchema`, `UpdateAssessmentBodySchema`, `UpdateAssessmentStatusBodySchema`, `AddAssessmentProblemBodySchema`, `AssessmentParamsSchema`, `AssessmentProblemParamsSchema`, `AssessmentQuerySchema`.
  - Define response schemas: `AssessmentSummaryResponseSchema`, `AssessmentDetailResponseSchema`, `AssessmentProblemResponseSchema`.
  - Register OpenAPI paths with tags `["Assessments"]`, BearerAuth, CookieAuth, and OrganizationContext:
    - `POST /assessments` (201, 400, 401, 403, 422)
    - `GET /assessments` (200 paginated, 401, 403)
    - `GET /assessments/{id}` (200, 401, 403, 404)
    - `PUT /assessments/{id}` (200, 400, 401, 403, 404, 409, 422)
    - `POST /assessments/{id}/problems` (201, 400, 401, 403, 404, 409, 422)
    - `DELETE /assessments/{id}/problems/{problemId}` (200, 401, 403, 404, 409)
    - `PATCH /assessments/{id}/status` (200, 400, 401, 403, 404, 409, 422)
    - `DELETE /assessments/{id}` (200, 401, 403, 404, 409)
- **Verification**: `npm run docs:validate`.

### U2. Assessment Repository Layer
- **Goal**: Implement database access layer encapsulating Prisma operations for `Assessment` and `AssessmentProblem`.
- **Requirements**: Covers R2, R3, R5, R6, R7, R11, R12, R13, R14, R15, R17.
- **Files**:
  - `src/modules/assessment/assessment.repository.ts`
- **Approach**:
  - Implement `create(data)` for assessment.
  - Implement `findMany(params)` with pagination, status filter, title/description search, and `_count` for problems, invitations, and attempts.
  - Implement `findById(id, organizationId)` returning assessment with attached `assessmentProblems` (including problem details) ordered by `orderIndex ASC`, and counts.
  - Implement `update(id, organizationId, data)` for metadata and status.
  - Implement `delete(id, organizationId)`.
  - Implement `addProblem(assessmentId, problemId, points, orderIndex)` and `removeProblem(assessmentId, problemId)`.
  - Implement `findAssessmentProblem(assessmentId, problemId)`.
  - Implement `getMaxOrderIndex(assessmentId)`.
  - Implement `calculateTotalScore(assessmentId)`.
  - Implement `countAttempts(assessmentId)` to guard against invalid deletion.
- **Verification**: `npx tsc --noEmit`.

### U3. Assessment Service Layer
- **Goal**: Implement business logic, validation rules, state machine transitions, and totalScore synchronizations.
- **Requirements**: Covers R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R14, R15, R17.
- **Files**:
  - `src/modules/assessment/assessment.service.ts`
- **Approach**:
  - `createAssessment`: create assessment with status DRAFT and totalScore 0.0.
  - `getAssessments`: execute paginated query, format meta.
  - `getAssessmentById`: retrieve detail with ordered problems; throw 404 if not found.
  - `updateAssessment`: check status not CLOSED/ARCHIVED; validate passingScore <= totalScore; update.
  - `addProblem`: ensure assessment is DRAFT; verify problem exists in organization; check duplicate; auto-assign orderIndex if omitted; add problem; recalculate totalScore.
  - `removeProblem`: ensure assessment is DRAFT; verify relation exists; remove; recalculate totalScore.
  - `updateStatus`: validate state machine transition; verify prerequisites for PUBLISHED (problems > 0, totalScore > 0, passingScore <= totalScore); update status.
  - `deleteAssessment`: ensure assessment exists; check countAttempts > 0 (throw 409 Conflict); delete.
- **Verification**: `npx tsc --noEmit`.

### U4. Assessment Controller & Routes Integration
- **Goal**: Wire HTTP endpoints, apply auth/organization middlewares, validate requests, and mount in Express router.
- **Requirements**: Covers R16, R17, and all endpoints.
- **Files**:
  - `src/modules/assessment/assessment.controller.ts`
  - `src/modules/assessment/assessment.routes.ts`
  - `src/routes/index.ts`
- **Approach**:
  - Build `assessment.controller.ts` with handlers returning standard envelopes (`ApiResponse`, `ApiPaginatedResponse`).
  - Build `assessment.routes.ts` with `requireAuth`, `requireCompanyRole(["admin", "recruiter"])`, and `validateRequest`.
  - Mount `assessmentRouter` in `src/routes/index.ts` under `/assessments`.
- **Verification**: `npm run docs:validate` and `npx tsc --noEmit`.

### U5. Modular Assessment Seeder
- **Goal**: Create idempotent seed data for demo organization `techcorp` and connect into master seed pipeline.
- **Requirements**: Covers R18.
- **Files**:
  - `prisma/seeds/assessments.seed.ts`
  - `prisma/seed.ts`
- **Approach**:
  - Query seeded problems for `techcorp` (created by `problems.seed.ts`).
  - Seed Assessment 1: "Full Stack Engineering Assessment" (status: `PUBLISHED`, 60 mins, passingScore 70, attaches 4 problems).
  - Seed Assessment 2: "Frontend Core Fundamentals" (status: `ACTIVE`, 30 mins, passingScore 20, attaches 3 MCQs).
  - Seed Assessment 3: "Backend Architecture Challenge" (status: `DRAFT`, 90 mins, attaches 2 problems).
  - Use idempotent upsert / existence checks.
  - Register `seedAssessments(userSummary, problemSummary)` in `prisma/seed.ts`.
- **Verification**: `npm run prisma:seed`.

### U6. Automated E2E Verification Script
- **Goal**: Add verification script validating the full assessment lifecycle end-to-end.
- **Files**:
  - `src/scripts/test-assessments-e2e.ts`
  - `package.json` (add script `"test:assessments": "tsx src/scripts/test-assessments-e2e.ts"`)
- **Approach**:
  - Authenticate as `recruiter@techcorp.dev`.
  - Create draft assessment (`POST /api/v1/assessments`).
  - Add problems (`POST /api/v1/assessments/:id/problems`) and verify `totalScore` recalculation.
  - Transition status to `PUBLISHED` (`PATCH /api/v1/assessments/:id/status`).
  - Verify that adding problems to `PUBLISHED` assessment fails with 409 Conflict.
  - Transition status to `ACTIVE`.
  - Fetch detailed assessment (`GET /api/v1/assessments/:id`).
  - Verify deletion guard logic.
- **Verification**: `npm run test:assessments`.

---

## Verification Contract

| Check / Command | Type | Target / Success Criteria |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | Static Typecheck | Zero compilation errors across all modules, tests, and seed files |
| `npm run docs:validate` | Contract Integrity | All 8 assessment endpoints registered and valid in OpenAPI 3.1 spec |
| `npm run prisma:seed` | Data Pipeline | Master seeder runs idempotently and populates assessment records |
| `npm run test:assessments` | E2E Integration | Full assessment lifecycle passes with 200/201 status codes and error guards |

---

## Definition of Done

- All 8 assessment endpoints implemented and mounted at `/api/v1/assessments`.
- Atomic `totalScore` calculation synchronized on all problem additions and deletions.
- Status transition state machine enforces valid workflows (`DRAFT` $\rightarrow$ `PUBLISHED` $\rightarrow$ `ACTIVE` $\rightarrow$ `CLOSED` $\rightarrow$ `ARCHIVED`).
- Problem additions locked once assessment leaves `DRAFT` status.
- Deletion locked if assessment has associated candidate attempts.
- OpenAPI 3.1 documentation parity verified with `npm run docs:validate`.
- Modular seeder `prisma/seeds/assessments.seed.ts` implemented and verified via `npm run prisma:seed`.
- `npx tsc --noEmit` passes with 0 errors.
- E2E script `npm run test:assessments` passes.

