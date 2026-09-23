# Developer Assessment & Coding Platform Server

The backend server for the **Developer Assessment & Coding Platform** — a multi-tenant recruitment and educational testing SaaS platform. It enables organizations to curate question banks, build structured assessments, invite candidates, manage timed testing sessions, and perform human-in-the-loop scoring for coding and written questions.

---

## 💡 Project Idea & Concept

Traditional technical assessment platforms often rely on complex, resource-heavy containerized sandboxes (like Docker or Judge0) to automatically execute arbitrary candidate code. 

This platform takes a **human-centered, rubric-driven approach**:
- **Automated Grading for MCQs**: Objective multiple-choice questions are instantly evaluated against verified answer keys upon candidate submission.
- **Rubric-Based Human Evaluation for Coding & Written Problems**: Coding challenges and essay questions are routed to a centralized **Evaluation Queue**, where recruiters and technical hiring managers assess code quality, problem-solving approach, and essays against standardized scoring rubrics.
- **Strict Identity & Tenant Isolation**: Built with a multi-tenant architecture where companies independently manage their question banks, assessments, candidate invitations, and evaluation teams under custom RBAC permissions. Candidates authenticate before taking assessments, ensuring verified identity matching.

---

## 🚀 Key Features

- **Multi-Tenancy & Role-Based Access Control (RBAC)**:
  - Powered by **Better Auth** with two-tiered RBAC (`PLATFORM_ADMIN`, `COMPANY_ADMIN`, `RECRUITER`, and `CANDIDATE`).
  - Supports organization switching, team member management, and role-guarded endpoints.
  - Supports both HTTP-only session cookies and `Authorization: Bearer <token>` headers.
- **Problem Bank Management**:
  - Create and manage questions across multiple formats: Multiple Choice (MCQ), Long-form Written/Essay, and Coding Challenges.
  - Supports starter code templates, language specifications, test cases, and customizable grading rubrics.
- **Assessment Builder & Assembly**:
  - Assemble assessments from problem bank questions with custom point weightings.
  - Configurable time limits, total marks, passing thresholds, and draft/published lifecycle states.
- **Secure Candidate Invitations**:
  - Tokenized, time-sensitive candidate invitations linked to candidate email addresses.
  - Enforces authenticated account verification matching prior to granting assessment access.
- **Timed Candidate Attempt Engine**:
  - Secure test-taking environment with countdown timers and autosave draft responses.
  - Atomic submission with automatic instant MCQ grading and state transitions.
- **Evaluation Queue & Manual Review**:
  - Dedicated review queue for recruiters and hiring managers.
  - Rubric-driven scoring with granular point allocation and qualitative feedback per problem.
- **Candidate Scorecards & Analytics**:
  - Comprehensive performance reports including percentile rankings, category breakdowns, and audit trails.
- **Code-First OpenAPI 3.1 & Swagger Documentation**:
  - Zero-drift API documentation generated directly from Zod schemas and Better Auth plugins.
  - Interactive Swagger UI served at `/api/docs` and raw spec at `/api/docs/openapi.json`.

---

## 🛠️ Tech Stack

- **Runtime & Language**: [Node.js](https://nodejs.org/) (v20+) & [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Web Framework**: [Express.js](https://expressjs.com/) (v5)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) & [Prisma ORM](https://www.prisma.io/) (with `@prisma/adapter-pg`)
- **Authentication & RBAC**: [Better Auth](https://www.better-auth.com/) (`organization`, `admin`, `bearer`, and `openAPI` plugins)
- **Validation & Documentation**: [Zod](https://zod.dev/) & [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi), [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express)
- **Development Tooling**: `tsx`, `prisma CLI`, `@better-auth/cli`

---

## 🏁 Getting Started

Follow these steps to set up and run the server locally.

### Prerequisites

Ensure you have the following installed:
- **Node.js** (v20 or higher recommended)
- **PostgreSQL** database instance running locally or hosted (e.g., Supabase, Neon)
- **npm** (comes bundled with Node.js)

---

### Step 1: Clone & Install Dependencies

```bash
git clone <repository-url>
cd dev-assessment-platform-server
npm install
```

---

### Step 2: Environment Configuration

Create a `.env` file in the root directory by copying the example template:

```bash
cp .env.example .env
```

Open `.env` and configure your database connection and secrets:

```env
# Server
PORT=5000
NODE_ENV=development

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dev_assessment_db?schema=public"

# Better Auth Configuration (generate a 32+ char secret: openssl rand -base64 32)
BETTER_AUTH_SECRET="your-secure-random-secret-key-at-least-32-chars-long"
BETTER_AUTH_URL="http://localhost:5000"

# CORS Configuration
CORS_ORIGIN="http://localhost:3000"
```

---

### Step 3: Run Database Migrations

Generate Prisma Client and apply database schema migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

---

### Step 4: Seed Initial Data

Populate the database with demo organizations, users, problem bank entries, assessments, and sample candidate attempts:

```bash
npm run prisma:seed
```

#### 🔑 Pre-Configured Test Accounts (Password: `Password123!`)

| Persona | Email | Role / Context |
| :--- | :--- | :--- |
| **Platform Admin** | `admin@platform.dev` | Global platform administrator |
| **Company Admin** | `admin@techcorp.dev` | Organization Admin (`TechCorp Solutions`) |
| **Recruiter** | `recruiter@techcorp.dev` | Hiring manager / Evaluator (`TechCorp Solutions`) |
| **Candidates** | `alice@candidate.dev`<br>`bob@candidate.dev` | Test-takers with active invitations & attempts |

---

### Step 5: Start the Development Server

```bash
npm run dev
```

The server will boot up with hot-reloading at **`http://localhost:5000`**.

---

## 📖 API Documentation

Once the server is running, explore the interactive documentation:

- **Interactive Swagger UI**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- **OpenAPI 3.1 JSON Specification**: [http://localhost:5000/api/docs/openapi.json](http://localhost:5000/api/docs/openapi.json)

---

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server in watch mode using `tsx` |
| `npm run build` | Compiles TypeScript into the `dist/` directory |
| `npm start` | Runs the compiled server from `dist/server.js` |
| `npm run prisma:generate` | Generates the latest Prisma Client types |
| `npm run prisma:migrate` | Runs database migrations in development mode |
| `npm run prisma:studio` | Opens visual Prisma Studio database GUI |
| `npm run prisma:seed` | Runs idempotent seed pipeline (`prisma/seed.ts`) |
| `npm run docs:validate` | Validates OpenAPI 3.1 specification schema integrity |
| `npm run test:e2e` | Runs problem module end-to-end integration test |
| `npm run test:assessments` | Runs assessment lifecycle end-to-end test |
| `npm run test:invitations` | Runs candidate invitation flow test |
| `npm run test:attempts` | Runs candidate attempt flow test |
| `npm run test:evaluations` | Runs evaluation queue & scoring test |
| `npm run test:reports` | Runs candidate scorecard & performance report test |

---

## 📂 Project Architecture

```
src/
├── app.ts                  # Express application setup & middleware pipeline
├── server.ts               # HTTP server bootstrap & graceful shutdown
├── config/                 # Zod-validated environment config
├── lib/
│   ├── auth.ts             # Better Auth configuration & plugin registration
│   ├── prisma.ts           # Prisma database client singleton
│   └── openapi.ts          # OpenAPI registry & specification builder
├── errors/                 # AppError, error codes, and global error middleware
├── middlewares/            # Session guard, organization RBAC, Zod validation
├── routes/                 # API V1 router aggregation & health check
└── modules/                # Feature-driven domain modules
    ├── problem/            # Problem bank (MCQ, Written, Coding)
    ├── assessment/         # Assessment builder & assembly
    ├── invitation/         # Candidate invitations & token verification
    ├── attempt/            # Timed assessment attempt session engine
    ├── evaluation/         # Human grading queue & rubric scoring
    └── report/             # Candidate scorecards & performance reporting
```
