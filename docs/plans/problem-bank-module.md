---
title: Problem Bank Module - Plan
type: feat
date: 2026-09-13
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
origin: docs/backend-requirements-and-architecture.md
execution: code
---

## Goal Capsule

- Objective: Implement the Problem Bank module providing multi-tenant CRUD operations for assessment questions (MCQ Single, MCQ Multiple, Written, Coding) with rubric storage, tenant isolation, active-assessment modification locks, code-first OpenAPI 3.1 documentation, and idempotent seed data.
- Authority Hierarchy:
  1. Primary Specification (`docs/backend-requirements-and-architecture.md`)
  2. Agent Guidelines (`AGENTS.md`)
  3. This Plan (`docs/plans/problem-bank-module.md`)
- Execution Profile: `code`
- Stop Conditions: Stop and request feedback if changes to `prisma/schema.prisma` are required or if Better Auth organization roles conflict with tenant guards.
- Tail Ownership: Automated documentation validation (`npm run docs:validate`), TypeScript compilation (`npx tsc --noEmit`), and seed execution (`npm run prisma:seed`).

---

## Product Contract

### Summary
The Problem Bank module allows Recruiters and Company Administrators to create, list, inspect, edit, and delete questions across four question types (single-choice MCQ, multiple-choice MCQ, written essay, and coding challenge) scoped strictly to their organization tenant. Questions maintain rubrics and test metadata for downstream evaluation and are protected against deletion or mutation when referenced in active assessments.

### Problem Frame
Recruiters and hiring managers require a structured question repository where they can author and categorize diverse assessment questions before assembling them into candidate assessments. Different question types have distinct validation constraints (e.g., correct answer option counts for MCQs, sample inputs/outputs and allowed languages for coding challenges). To maintain testing integrity, questions in active assessments must be immutable, and cross-tenant leakage between competing companies must be strictly prevented.

### Requirements

#### Question Types & Validation
- R1. The system shall support four question types via the `QuestionType` enum: `MCQ_SINGLE`, `MCQ_MULTIPLE`, `WRITTEN`, and `CODING`.
- R2. When creating or updating an `MCQ_SINGLE` problem, `mcqOptions` must contain at least 2 choices, and exactly 1 choice must have `isCorrect: true`.
- R3. When creating or updating an `MCQ_MULTIPLE` problem, `mcqOptions` must contain at least 2 choices, and at least 1 choice must have `isCorrect: true`.
- R4. When creating or updating a `CODING` problem, `codingDetails` must contain `allowedLanguages` (array of supported language identifiers) and `sampleIo` (array of sample input/output objects).
- R5. When creating or updating a `WRITTEN` or `CODING` problem, an optional `evaluationRubric` markdown/text string can be provided to guide human reviewers during subsequent grading.
- R6. Each problem must have a title (3-200 characters), description (min 10 characters), difficulty (`EASY`, `MEDIUM`, `HARD`), default points (> 0, default 10.0), and tags array.

#### Multi-Tenancy & Authorization
- R7. All problem bank endpoints (`/api/v1/problems/*`) shall require an authenticated user session (`requireAuth`) and membership in the tenant organization with an `admin` (`COMPANY_ADMIN`) or `recruiter` (`RECRUITER`) role (`requireCompanyRole(["admin", "recruiter"])`).
- R8. All queries and mutations must strictly enforce tenant isolation using `organizationId = req.organizationId`.
- R9. Newly created problems must automatically record `creatorId = req.user.id` and `organizationId = req.organizationId`.

#### Querying & Management
- R10. Listing problems (`GET /api/v1/problems`) shall support pagination (`page`, `limit`), filtering by `type`, `difficulty`, `tags`, and text search over `title` and `description`.
- R11. Listing problems must return paginated metadata (`page`, `limit`, `totalItems`, `totalPages`) within the standard `ApiPaginatedResponse<T>` envelope.
- R12. Fetching a single problem (`GET /api/v1/problems/:id`) must return the complete problem entity including `mcqOptions`, `codingDetails`, and `evaluationRubric` within the standard `ApiResponse<T>` envelope, returning 404 if the problem does not belong to the active organization.
- R13. Updating a problem (`PUT /api/v1/problems/:id`) must reject modifications with 409 Conflict if the problem is attached to any assessment with status `ACTIVE` or `PUBLISHED`.
- R14. Deleting a problem (`DELETE /api/v1/problems/:id`) must reject deletion with 409 Conflict if the problem is attached to any assessment (`AssessmentProblem` count > 0).

#### Seeding & Documentation
- R15. The module must provide an idempotent feature seeder at `prisma/seeds/problems.seed.ts` populated with diverse test questions (MCQs, coding challenges, essays) for the demo organization `techcorp`, registered inside `prisma/seed.ts`.
- R16. All endpoints in the Problem Bank module must be registered in the shared OpenAPI registry (`src/lib/openapi.ts`) using `@asteasolutions/zod-to-openapi` with standard success (`200`, `201`) and error (`400`, `401`, `403`, `404`, `409`, `422`, `500`) responses.

### Scope Boundaries
- In Scope: Problem entity CRUD operations, Zod validation per question type, tenant isolation, active assessment mutation locks, assessment association deletion guards, OpenAPI route registrations, and modular seeding.
- Out of Scope / Deferred:
  - Candidate-scrubbed problem views (handled in the `attempt` module when candidate sessions start).
  - Associating problems with assessments (handled in the `assessment` module via `/api/v1/assessments/:id/problems`).
  - Code execution/running (expressly excluded per platform architecture; evaluation is handled in the `evaluation` module).

---

## Planning Contract

### Key Technical Decisions
- KTD1. **Layered Architecture Consistency**: Follow the established clean modular structure with 5 dedicated files under `src/modules/problem/`:
  - `problem.schema.ts`: Zod schemas, OpenAPI path registrations, request/response DTOs.
  - `problem.repository.ts`: Encapsulated Prisma database interactions.
  - `problem.service.ts`: Business logic, MCQ option validation, assessment association checks.
  - `problem.controller.ts`: Express request handling, parameter extraction, response dispatching.
  - `problem.routes.ts`: Route mounting with `requireAuth`, `requireCompanyRole`, `validateRequest`.
- KTD2. **Conditional Validation via Zod `superRefine`**: Use Zod `superRefine` in `CreateProblemBodySchema` and `UpdateProblemBodySchema` to enforce type-specific validation (e.g. `MCQ_SINGLE` requires exactly one correct option, `MCQ_MULTIPLE` requires at least one correct option, `CODING` requires `codingDetails`) while ensuring clean serialization into OpenAPI components.
- KTD3. **Option ID Generation**: Automatically assign UUIDs to items in `mcqOptions` if the client does not provide explicit `id` attributes, guaranteeing stable option keys for subsequent candidate attempts.
- KTD4. **Assessment Integrity Protection**: Prior to `PUT` updates, query `prisma.assessmentProblem.findFirst` for linked assessments in `ACTIVE` or `PUBLISHED` states; if found, throw `AppError.conflict(...)`. Prior to `DELETE`, check if any `AssessmentProblem` references the problem ID to uphold relational referential integrity gracefully before database constraints trigger.
- KTD5. **Idempotent Seeder Keying**: Seed records in `prisma/seeds/problems.seed.ts` using stable unique titles scoped to `organizationId`, checking for prior existence before creation to guarantee safe repeated runs of `npm run prisma:seed`.

---

## Implementation Units

### U1. Problem Validation Schemas & OpenAPI Path Registration
- **Goal**: Define comprehensive Zod schemas and register all `/api/v1/problems` OpenAPI 3.1 endpoints in the global registry.
- **Requirements**: Covers R1, R2, R3, R4, R5, R6, R10, R11, R16.
- **Files**:
  - `src/modules/problem/problem.schema.ts`
- **Approach**:
  - Define `McqOptionSchema`, `CodingDetailsSchema`, `CreateProblemBodySchema`, `UpdateProblemBodySchema`, `ProblemQuerySchema`, and `ProblemResponseSchema`.
  - Add `superRefine` checks for `MCQ_SINGLE`, `MCQ_MULTIPLE`, and `CODING` shapes.
  - Register OpenAPI paths for `POST /problems`, `GET /problems`, `GET /problems/{id}`, `PUT /problems/{id}`, and `DELETE /problems/{id}` with `BearerAuth`, `CookieAuth`, and `OrganizationContext` security requirements.
- **Test Scenarios**:
  - Verify invalid MCQ payloads (e.g., zero correct options) trigger 422 Unprocessable Entity.
  - Verify `npm run docs:validate` succeeds and documents all 5 problem routes.
- **Verification**: `npm run docs:validate`

### U2. Problem Repository Layer
- **Goal**: Create the database access layer isolating Prisma operations for the `Problem` model.
- **Requirements**: Covers R7, R8, R9, R10, R11, R12, R13, R14.
- **Files**:
  - `src/modules/problem/problem.repository.ts`
- **Approach**:
  - Implement `create(data)` creating a problem record.
  - Implement `findMany({ organizationId, type, difficulty, tags, search, skip, take })` with count for pagination.
  - Implement `findById(id, organizationId)` fetching a single problem by ID and tenant.
  - Implement `update(id, organizationId, data)` updating fields.
  - Implement `delete(id, organizationId)` deleting the problem.
  - Implement `findActiveAssessmentsUsingProblem(problemId)` querying `AssessmentProblem` joins where `assessment.status IN ['ACTIVE', 'PUBLISHED']`.
  - Implement `countAssessmentUsage(problemId)` counting any `AssessmentProblem` records.
- **Verification**: TypeScript compile check (`npx tsc --noEmit`).

### U3. Problem Service Layer
- **Goal**: Implement business logic, tenant enforcement, assessment lock checks, and option normalization.
- **Requirements**: Covers R2, R3, R4, R5, R7, R8, R9, R12, R13, R14.
- **Files**:
  - `src/modules/problem/problem.service.ts`
- **Approach**:
  - `createProblem`: normalize MCQ option UUIDs if missing, persist problem with `creatorId` and `organizationId`.
  - `getProblems`: execute paginated query with total calculation (`totalPages = Math.ceil(totalItems / limit)`).
  - `getProblemById`: fetch by ID, throw `AppError.notFound` if missing.
  - `updateProblem`: fetch problem, verify tenant, check if linked to `ACTIVE` or `PUBLISHED` assessments via `findActiveAssessmentsUsingProblem`, throw `AppError.conflict` if locked, update record.
  - `deleteProblem`: fetch problem, check `countAssessmentUsage`, throw `AppError.conflict` if used in assessments, delete record.
- **Verification**: TypeScript compile check (`npx tsc --noEmit`).

### U4. Problem Controller & Express Route Integration
- **Goal**: Expose the problem endpoints via Express router, integrate into main API router, and handle HTTP transactions.
- **Requirements**: Covers R7, R8, R10, R11, R12, R13, R14.
- **Files**:
  - `src/modules/problem/problem.controller.ts`
  - `src/modules/problem/problem.routes.ts`
  - `src/routes/index.ts`
- **Approach**:
  - Build `problem.controller.ts` with handlers calling the service and sending standard JSON envelopes (`ApiResponse`, `ApiPaginatedResponse`).
  - Build `problem.routes.ts` protecting routes with `requireAuth`, `requireCompanyRole(["admin", "recruiter"])`, and `validateRequest`.
  - Mount `problemRouter` in `src/routes/index.ts` under `/problems`.
- **Verification**: `npm run docs:validate` and `npx tsc --noEmit`.

### U5. Modular Problem Seeder
- **Goal**: Create idempotent seed data with realistic problems for the demo organization and wire into master seed script.
- **Requirements**: Covers R15.
- **Files**:
  - `prisma/seeds/problems.seed.ts`
  - `prisma/seed.ts`
- **Approach**:
  - Create sample questions:
    - 2 `MCQ_SINGLE` problems (e.g. JavaScript Closures, SQL Joins).
    - 2 `MCQ_MULTIPLE` problems (e.g. REST API Idempotency, HTTP Security Headers).
    - 2 `WRITTEN` problems (e.g. Distributed Caching Strategies, Database Sharding Considerations).
    - 2 `CODING` problems (e.g. Implement LRU Cache, String Anagram Detection).
  - Use `techcorp` organization and `recruiter` / `admin` users from `users.seed.ts`.
  - Implement idempotent creation: check if problem with matching title and organizationId exists before creating.
  - Update `prisma/seed.ts` to call `seedProblems(userSummary)`.
- **Verification**: `npm run prisma:seed`.

---

## Verification Contract

| Check / Command | Type | Target / Success Criteria |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | Static Typecheck | Zero compilation errors across all modules and seed files |
| `npm run docs:validate` | Contract Integrity | All 5 problem endpoints registered and spec builds without error |
| `npm run prisma:seed` | Data Pipeline | Master seeder completes without errors and seeds problems idempotently |

---

## Definition of Done

- All 5 problem endpoints (`POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`) implemented and mounted at `/api/v1/problems`.
- All requests validated using Zod with type-specific validation rules.
- Tenant isolation enforced on all queries and mutations via `x-organization-id` / session context.
- Modification locked for problems linked to active assessments; deletion guarded against assessment references.
- 100% OpenAPI documentation parity verified by `npm run docs:validate`.
- Modular seeder `prisma/seeds/problems.seed.ts` created, integrated in `prisma/seed.ts`, and verified via `npm run prisma:seed`.
- `npx tsc --noEmit` runs with 0 errors.

