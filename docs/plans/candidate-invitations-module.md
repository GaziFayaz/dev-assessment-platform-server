---
title: Candidate Invitations Module - Plan
type: feat
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
origin: docs/backend-requirements-and-architecture.md
execution: code
---

## Goal Capsule

- Objective: Implement the Candidate Invitations module enabling Recruiters and Company Admins to dispatch single and bulk assessment invitations, track invitation delivery and attempt lifecycles, and enforce secure token verification with mandatory candidate account email matching (Option B) before assessment attempt initiation.
- Authority Hierarchy:
  1. Primary Specification (`docs/backend-requirements-and-architecture.md`)
  2. Agent Guidelines (`AGENTS.md`)
  3. This Plan (`docs/plans/candidate-invitations-module.md`)
- Execution Profile: `code`
- Stop Conditions: Stop and request feedback if changes to `prisma/schema.prisma` are required or if Better Auth organization roles conflict with tenant guards.
- Tail Ownership: Automated documentation validation (`npm run docs:validate`), TypeScript compilation (`npx tsc --noEmit`), seed execution (`npm run prisma:seed`), and E2E verification (`npm run test:invitations`).

---

## Product Contract

### Summary
The Candidate Invitations module bridges assessment creation and candidate testing. It empowers Recruiters and Company Administrators to invite candidates to `PUBLISHED` or `ACTIVE` assessments via secure unique invitation tokens. It provides real-time tracking of sent invitations (`INVITED`, `STARTED`, `COMPLETED`, `EXPIRED`) and exposes a token verification endpoint that strictly verifies the authenticated candidate's verified account email matches the invitation record before granting assessment access (preventing unauthorized proxy test-taking).

### Problem Frame
Organizations need to invite external candidates to take published technical assessments. Each invitation must be uniquely trackable, time-bounded, and immune to unauthorized interception or transfer. Under the platform's Option B security model, candidate test-takers must sign up or log in with their own authenticated Better Auth accounts; the backend must strictly enforce that the logged-in candidate's email exactly matches the invitation recipient email before an attempt session can be launched. Furthermore, invitations must not be sent for unfinished draft assessments or closed assessments.

### Requirements

#### Invitation Creation & Dispatch
- R1. Authorized company members (`COMPANY_ADMIN`, `RECRUITER`) can send candidate invitations for an assessment via `POST /api/v1/assessments/:id/invitations`.
- R2. Invitations can be dispatched singly or in bulk (array of recipient objects containing `candidateEmail` and optional `candidateName`).
- R3. The system shall only permit sending invitations if the target assessment belongs to the active organization (`req.organizationId`) and has a status of `PUBLISHED` or `ACTIVE`. Attempts to invite candidates to `DRAFT`, `CLOSED`, or `ARCHIVED` assessments must be rejected with HTTP 409 Conflict.
- R4. Each invitation must automatically generate a cryptographically secure, unique `inviteToken` (UUID or secure hex string) and compute an `expiresAt` timestamp (default: 7 days from creation, or bounded by the assessment's `validUntil` date if earlier).
- R5. If a candidate email has already been invited to the same assessment:
  - If an associated attempt already exists (`STARTED` or `COMPLETED`), reject the duplicate invitation with HTTP 409 Conflict.
  - If an existing invitation is pending or expired with zero attempts, allow renewing/refreshing the invitation with a fresh expiration date and token.

#### Invitation Tracking & Querying
- R6. Authorized company members can retrieve a paginated list of invitations for an assessment via `GET /api/v1/assessments/:id/invitations`.
- R7. The list endpoint shall support pagination (`page`, `limit`), filtering by computed status (`INVITED`, `STARTED`, `COMPLETED`, `EXPIRED`), and text search by `candidateEmail` or `candidateName`.
- R8. Each returned invitation record must include delivery metadata, computed lifecycle status, and associated attempt summary (if an attempt has been initiated).

#### Candidate Token Verification (Option B Gate)
- R9. Authenticated candidates can verify an invitation token via `GET /api/v1/invitations/verify/:token`. This endpoint requires an active Better Auth session (`requireAuth`).
- R10. Token Verification Access Rules:
  - If the token does not exist in the database, return HTTP 404 Not Found.
  - If the authenticated user's email (`req.user.email`) does NOT match `CandidateInvitation.candidateEmail`, reject with HTTP 403 Forbidden (`"Forbidden: Authenticated account email does not match invitation recipient"`).
  - If the invitation has expired (`expiresAt < new Date()`), reject with HTTP 410 Gone (`"Invitation token has expired"`).
  - If the parent assessment is `CLOSED` or `ARCHIVED`, reject with HTTP 409 Conflict (`"Assessment is no longer open for attempts"`).
- R11. On successful verification, the endpoint returns a candidate-safe assessment overview DTO (assessment title, description, instructions, duration, validity window, organization branding) and flag `canStart: true`, omitting sensitive information like rubrics, correct options, or creator identity.

#### Multi-Tenancy & Authorization
- R12. All management endpoints (`/api/v1/assessments/:id/invitations`) require `requireAuth` and `requireCompanyRole(["admin", "recruiter"])`, scoped strictly to `organizationId = req.organizationId`.
- R13. The candidate verification endpoint (`/api/v1/invitations/verify/:token`) requires `requireAuth` for any authenticated candidate account (regardless of organization membership).

#### Seeding & Documentation
- R14. The module must provide an idempotent feature seeder at `prisma/seeds/invitations.seed.ts` linking seeded candidates (`alice@candidate.dev`, `bob@candidate.dev`) to active and published assessments of `techcorp`, registered in `prisma/seed.ts`.
- R15. 100% of endpoints in the Candidate Invitations module must be registered in the OpenAPI registry (`src/lib/openapi.ts`) using `@asteasolutions/zod-to-openapi` with standard success and error response schemas.

### Scope Boundaries
- In Scope: Single and bulk invitation creation, token generation, invitation query and status computation, candidate account matching verification, OpenAPI 3.1 documentation, modular seeding, and E2E verification test.
- Out of Scope / Deferred:
  - Actual SMTP/Email transport dispatch (mocked / log-driven for testing; pluggable email provider deferred).
  - Attempt initialization and countdown timer start (`POST /api/v1/attempts/start` handled in Module 4: Attempt Engine).

---

## Planning Contract

### Key Technical Decisions
- KTD1. **Layered Architecture Consistency**: Follow the established 5-layer modular pattern under `src/modules/invitation/`:
  - `invitation.schema.ts`: Zod request/response schemas, OpenAPI path definitions, query filters.
  - `invitation.repository.ts`: Encapsulated Prisma database operations scoped by tenant and token.
  - `invitation.service.ts`: Business logic, status state validation, token generation, email matching verification.
  - `invitation.controller.ts`: Express request handling, parameter extraction, standard `ApiResponse` / `ApiPaginatedResponse`.
  - `invitation.routes.ts`: Two routers exported:
    - `assessmentInvitationRouter`: mounted at `/api/v1/assessments/:id/invitations` with `requireAuth` + `requireCompanyRole(["admin", "recruiter"])`.
    - `invitationRouter`: mounted at `/api/v1/invitations` with `requireAuth` (candidate token verification).
- KTD2. **Dynamic Invitation Lifecycle Resolution**: Compute invitation status dynamically based on timestamps and associated `attempts`:
  - `COMPLETED`: Associated attempt exists with `status === 'COMPLETED'`.
  - `STARTED`: Associated attempt exists with `status` in `['IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW']`.
  - `EXPIRED`: `expiresAt < NOW()` and no attempt exists.
  - `INVITED`: `expiresAt >= NOW()` and no attempt exists.
- KTD3. **Cryptographically Secure Token Generation**: Use Node.js built-in `crypto.randomUUID()` for `inviteToken`, guaranteeing high entropy, URL safety, and collision resistance without third-party dependencies.
- KTD4. **Strict Option B Account Match Enforcement**: Compare `invitation.candidateEmail.toLowerCase().trim() === req.user.email.toLowerCase().trim()`. Mismatches immediately halt execution with HTTP 403 Forbidden, guaranteeing zero proxy attempts.
- KTD5. **Idempotent Modular Seeder**: Seed invitations in `prisma/seeds/invitations.seed.ts` using stable tokens or unique `(assessmentId, candidateEmail)` lookups, ensuring safe repeated runs of `npm run prisma:seed`.

---

## Implementation Units

### U1. Invitation Validation Schemas & OpenAPI Registry
- **Goal**: Define Zod schemas for single/bulk invitations, query params, verification response, and register OpenAPI 3.1 paths in `src/lib/openapi.ts`.
- **Requirements**: Covers R1, R2, R4, R6, R7, R8, R9, R11, R15.
- **Files**:
  - `src/modules/invitation/invitation.schema.ts`
- **Approach**:
  - Define `CandidateInviteItemSchema`: `{ candidateEmail: email(), candidateName?: string }`.
  - Define `SendInvitationsBodySchema`: `{ invitations: array(CandidateInviteItemSchema).min(1).max(100), expiresInDays?: number }`. Also support single invite object via preprocessing.
  - Define `InvitationQuerySchema`: `{ page?: number, limit?: number, status?: enum, search?: string }`.
  - Define `InvitationParamsSchema`: `{ id: uuid() }` (assessmentId).
  - Define `VerifyTokenParamsSchema`: `{ token: string }`.
  - Define response schemas: `InvitationResponseSchema`, `InvitationDetailResponseSchema`, `VerifyInvitationResponseSchema`.
  - Register OpenAPI paths under tag `["Invitations"]`:
    - `POST /assessments/{id}/invitations` (201, 400, 401, 403, 404, 409, 422)
    - `GET /assessments/{id}/invitations` (200 paginated, 401, 403, 404)
    - `GET /invitations/verify/{token}` (200, 400, 401, 403, 404, 409, 410)
- **Verification**: `npm run docs:validate`.

### U2. Invitation Repository Layer
- **Goal**: Implement encapsulated Prisma database operations for `CandidateInvitation`.
- **Requirements**: Covers R1, R3, R4, R5, R6, R7, R8, R9, R10.
- **Files**:
  - `src/modules/invitation/invitation.repository.ts`
- **Approach**:
  - Implement `createMany(invitations)` / `upsertInvitation(data)`.
  - Implement `findManyByAssessment({ assessmentId, status, search, skip, take })` with count for pagination, including `attempts` summary.
  - Implement `findByToken(token)` including parent `assessment` (with organization) and `attempts`.
  - Implement `findExisting(assessmentId, candidateEmail)`.
  - Implement `delete(id)`.
- **Verification**: `npx tsc --noEmit`.

### U3. Invitation Service Layer
- **Goal**: Implement business rules, assessment status checks, token generation, duplicate handling, and candidate email verification.
- **Requirements**: Covers R1, R2, R3, R4, R5, R7, R8, R9, R10, R11, R12, R13.
- **Files**:
  - `src/modules/invitation/invitation.service.ts`
- **Approach**:
  - `sendInvitations`:
    - Fetch assessment; verify tenant ownership (`organizationId === req.organizationId`).
    - Verify assessment status is `PUBLISHED` or `ACTIVE` (throw 409 Conflict if `DRAFT`, `CLOSED`, `ARCHIVED`).
    - For each candidate: check existing invitation; if attempt exists, reject; if expired, renew token and expiry; if new, generate `crypto.randomUUID()` token.
    - Persist invitations in batch/transaction.
  - `getInvitations`:
    - Verify assessment belongs to organization.
    - Fetch paginated list, compute lifecycle status for each item (`INVITED`, `STARTED`, `COMPLETED`, `EXPIRED`).
  - `verifyInvitationToken`:
    - Fetch invitation by token. If not found, throw 404 Not Found.
    - Compare `invitation.candidateEmail` with `req.user.email`. If mismatch, throw 403 Forbidden.
    - Check expiration (`expiresAt < new Date()`). If expired, throw 410 Gone.
    - Check assessment status (`CLOSED` or `ARCHIVED` -> throw 409 Conflict).
    - Format candidate-safe response DTO with `canStart: true`.
- **Verification**: `npx tsc --noEmit`.

### U4. Invitation Controller & Express Route Integration
- **Goal**: Expose endpoints via Express routers, wire into `src/routes/index.ts`, and apply auth/role guards.
- **Requirements**: Covers R1, R6, R9, R12, R13.
- **Files**:
  - `src/modules/invitation/invitation.controller.ts`
  - `src/modules/invitation/invitation.routes.ts`
  - `src/routes/index.ts`
- **Approach**:
  - `assessmentInvitationRouter` (`mergeParams: true`):
    - `use(requireAuth, requireCompanyRole(["admin", "recruiter"]))`
    - `POST /` -> `invitationController.sendInvitations`
    - `GET /` -> `invitationController.getInvitations`
  - `invitationRouter`:
    - `use(requireAuth)`
    - `GET /verify/:token` -> `invitationController.verifyToken`
  - Mount both routers in `src/routes/index.ts`:
    - `apiV1Router.use("/assessments/:id/invitations", assessmentInvitationRouter)`
    - `apiV1Router.use("/invitations", invitationRouter)`
- **Verification**: `npm run docs:validate` and `npx tsc --noEmit`.

### U5. Modular Invitation Seeder
- **Goal**: Create idempotent seed data populating invitations for TechCorp's active and published assessments and wire into master seed pipeline.
- **Requirements**: Covers R14.
- **Files**:
  - `prisma/seeds/invitations.seed.ts`
  - `prisma/seed.ts`
- **Approach**:
  - Query seeded `techcorp` assessments (`Frontend Core Fundamentals` [ACTIVE] and `Full Stack Engineering Assessment` [PUBLISHED]).
  - Query seeded candidate users (`alice@candidate.dev`, `bob@candidate.dev`).
  - Idempotently seed:
    - Invitation 1: Alice to "Frontend Core Fundamentals" (ACTIVE).
    - Invitation 2: Bob to "Full Stack Engineering Assessment" (PUBLISHED).
  - Update `prisma/seed.ts` to call `seedInvitations(userSummary, assessmentSummary)`.
- **Verification**: `npm run prisma:seed`.

### U6. Automated E2E Verification Script
- **Goal**: Create comprehensive E2E script validating the full candidate invitation lifecycle.
- **Files**:
  - `src/scripts/test-invitations-e2e.ts`
  - `package.json` (add `"test:invitations": "tsx src/scripts/test-invitations-e2e.ts"`)
- **Approach**:
  - Test health & unauthenticated rejection (401).
  - Authenticate as Recruiter (`recruiter@techcorp.dev`).
  - Attempt to send invitations to a `DRAFT` assessment (must fail with 409 Conflict).
  - Send single and bulk invitations to an `ACTIVE` assessment (201 Created).
  - List invitations with pagination and status checks (`GET /assessments/:id/invitations`).
  - Authenticate as matching candidate (`alice@candidate.dev`); call `GET /invitations/verify/:token` (200 OK, `canStart: true`).
  - Authenticate as mismatched candidate (`bob@candidate.dev`); call `GET /invitations/verify/:token` using Alice's token (must fail with 403 Forbidden!).
  - Verify invalid token returns 404 Not Found.
- **Verification**: `npm run test:invitations`.

---

## Verification Contract

| Check / Command | Type | Target / Success Criteria |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | Static Typecheck | Zero compilation errors across all modules and scripts |
| `npm run docs:validate` | Contract Integrity | All 3 invitation endpoints registered and valid in OpenAPI 3.1 spec |
| `npm run prisma:seed` | Data Pipeline | Master seeder runs idempotently and populates invitation records |
| `npm run test:invitations` | E2E Integration | Full invitation lifecycle passes with 200/201 status codes and 403/409/404 security guards |

---

## Definition of Done

- All 3 invitation endpoints implemented and mounted at `/api/v1/assessments/:id/invitations` and `/api/v1/invitations/verify/:token`.
- Assessment status guard restricts invitation dispatch to `PUBLISHED` and `ACTIVE` assessments only.
- Dynamic lifecycle status resolution (`INVITED`, `STARTED`, `COMPLETED`, `EXPIRED`) verified on listings.
- Option B candidate email matching (`req.user.email === CandidateInvitation.candidateEmail`) strictly enforced with 403 Forbidden on mismatches.
- OpenAPI 3.1 documentation parity verified with `npm run docs:validate`.
- Modular seeder `prisma/seeds/invitations.seed.ts` implemented and integrated in `prisma/seed.ts`.
- `npx tsc --noEmit` passes with 0 errors.
- E2E script `npm run test:invitations` passes all checks.

