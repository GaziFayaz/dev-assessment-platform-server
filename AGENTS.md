# Project Context & Agent Guidelines

## 1. Project Overview & Primary Specification

This repository contains the backend server for the **Developer Assessment & Coding Platform**, a multi-tenant recruitment and educational testing SaaS platform.

> [!IMPORTANT]
> The single source of truth (SSOT) for all domain requirements, database schemas, API contracts, and architectural rules is documented in:
> 
> 📄 **[docs/backend-requirements-and-architecture.md](file:///d:/Codes/programming-hero/Level-2/mission6/dev-assessment-platform-server/docs/backend-requirements-and-architecture.md)**
> 
> Agents working on this repository **must consult this document** before designing, scaffolding, or implementing any features, schemas, or endpoints.

---

## 2. Technology Stack

- **Runtime & Language**: Node.js, TypeScript (`tsc` with strict type checking)
- **Web Framework**: Express.js
- **Database & ORM**: PostgreSQL, Prisma ORM
- **Authentication & RBAC**: Better Auth with plugins:
  - `organization` (multi-tenancy, member roles: `COMPANY_ADMIN`, `RECRUITER`)
  - `admin` (global platform administration: `PLATFORM_ADMIN`)
  - `bearer` (Bearer token header authentication support alongside cookies)
- **Validation**: Zod (environment variables, request validation)
- **Package Manager**: npm

---

## 3. Key Architectural Pillars & Constraints

1. **No Code Execution Engine (No Docker/Judge0)**:
   - This platform does **not** run arbitrary candidate code in a sandbox.
   - **MCQs** are automatically graded upon submission against correct answer keys.
   - **Coding & Written Questions** are queued into an **Evaluation Queue** where recruiters and company admins perform manual human scoring using rubrics.

2. **Mandatory Candidate Accounts**:
   - Candidates must have an authenticated Better Auth account before attempting an assessment.
   - Verified account email must match the invitation token before access to an attempt is granted.

3. **Modular Clean Layered Architecture**:
   - Code is structured by feature modules under `src/modules/` (e.g., `problem/`, `assessment/`, `invitation/`, `attempt/`, `evaluation/`, `report/`).
   - Each module contains dedicated controller, service, repository, and route layers.
   - Common configuration, database singletons, and authentication setups live in `src/config/` and `src/lib/`.

4. **CLI-First Tooling & Schema Discipline**:
   - Use official CLI tools for migrations and schema generations:
     - Better Auth CLI: `npx @better-auth/cli generate`
     - Prisma CLI: `npx prisma migrate dev`, `npx prisma generate`
   - Compile-time checking: `npm run build` / `npx tsc --noEmit`

---

## 4. Git Commit Guidelines

- **Incremental Commits**: Always commit to Git incrementally with meaningful commits with detailed descriptions when making modifications and have done any small but significant updates or additions.

---

## 5. Quick File Reference

- **Full Specification**: [docs/backend-requirements-and-architecture.md](file:///d:/Codes/programming-hero/Level-2/mission6/dev-assessment-platform-server/docs/backend-requirements-and-architecture.md)
- **Prisma Schema**: `prisma/schema.prisma`
- **Auth Setup**: `src/lib/auth.ts`
- **Prisma Singleton**: `src/lib/prisma.ts`

