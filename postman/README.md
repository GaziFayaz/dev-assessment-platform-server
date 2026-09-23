# Postman Testing Guide: Developer Assessment & Coding Platform

This directory contains pre-configured Postman resources to test the entire API lifecycle—including authentication, RBAC authorization, problem curation, assessment building, candidate invitation, timed attempt execution, human evaluation scoring, and cohort reporting.

---

## 📁 Files Included

1. [**`dev-assessment-platform.postman_collection.json`**](file:///d:/Codes/programming-hero/Level-2/mission6/dev-assessment-platform-server/postman/dev-assessment-platform.postman_collection.json)
   - Contains 40 fully configured requests organized into 8 functional folders.
   - Includes embedded JavaScript **Test Scripts** that automatically capture tokens, IDs, and tokens so you never have to manually copy-paste values between requests.
2. [**`dev-assessment-platform.postman_environment.json`**](file:///d:/Codes/programming-hero/Level-2/mission6/dev-assessment-platform-server/postman/dev-assessment-platform.postman_environment.json)
   - Pre-populated with default seed data: `baseUrl`, `organizationId` (TechCorp Solutions), default test credentials, problem IDs, and assessment IDs.

---

## 🚀 Quick Setup (2 Minutes)

### Step 1: Start the Backend Server
Make sure your database is seeded and the server is running:
```bash
# Seed the database (if not already done)
npm run prisma:seed

# Start the development server
npm run dev
```
The server will start on `http://localhost:5000`.

### Step 2: Import into Postman
1. Open **Postman**.
2. Click the **Import** button in the top-left corner.
3. Drag and drop both files from this `postman/` folder:
   - `dev-assessment-platform.postman_collection.json`
   - `dev-assessment-platform.postman_environment.json`
4. In the top-right environment dropdown in Postman, select:
   **`Dev Assessment Platform - Local`**.

---

## 🔑 Default Test Personas & Credentials

All test users share the default password: **`Password123!`**

| Persona | Email | Domain Tier | Capabilities |
| :--- | :--- | :--- | :--- |
| **Recruiter** | `recruiter@techcorp.dev` | Tenant (`TechCorp`) | Curates problems, creates assessments, sends invitations, grades submissions |
| **Company Admin** | `admin@techcorp.dev` | Tenant (`TechCorp`) | Full organization authority, manages members and assessments |
| **Candidate Alice** | `alice@candidate.dev` | Test Session | Starts timed attempts, submits answers, views own results |
| **Candidate Bob** | `bob@candidate.dev` | Test Session | Starts timed attempts, submits answers, views own results |
| **Platform Admin** | `admin@platform.dev` | Global Platform | Global governance, user administration |

---

## ⚡ Zero-Friction Token & Header Automation

- **Automatic Bearer Token Extraction**:
  Whenever you execute any `Sign In as ...` request in the **1. Authentication** folder, a test script automatically stores the returned session token into the `{{token}}` environment variable.
- **Collection-Level Authorization**:
  All requests in the collection automatically inherit `Authorization: Bearer {{token}}`.
- **Tenant Context (`x-organization-id`)**:
  All company/recruiter endpoints automatically include the `x-organization-id: {{organizationId}}` header pointing to **TechCorp Solutions**.

---

## 🔄 End-to-End Recommended Testing Walkthrough

Follow this step-by-step workflow to test the entire candidate assessment lifecycle:

### Phase 1: Recruiter Assessment Preparation
1. **Sign In**: Run `1. Authentication > Sign In as Recruiter (Alex Rivera)`.
   - *Result*: Environment variable `{{token}}` is populated with the recruiter's token.
2. **Explore Problems**: Run `2. Problem Bank > List Problems` or `Filter Problems by Type (CODING)`.
3. **Create Problem**: Run `2. Problem Bank > Create Problem (CODING)`.
   - *Result*: Newly created problem UUID is auto-saved to `{{problemId}}`.
4. **Create Assessment**: Run `3. Assessment Builder > Create Assessment Draft`.
   - *Result*: Newly created assessment UUID is auto-saved to `{{assessmentId}}`.
5. **Attach Problem**: Run `3. Assessment Builder > Add Problem to Assessment`.
6. **Publish Assessment**: Run `3. Assessment Builder > Publish Assessment (Transition Status)` (changes status to `PUBLISHED`).
7. **Dispatch Invitation**: Run `4. Candidate Invitations > Dispatch Candidate Invitations (Single / Bulk)`.
   - *Result*: Generates a unique invitation for `bob@candidate.dev` and saves it to `{{invitationToken}}`.

---

### Phase 2: Candidate Assessment Attempt
1. **Switch to Candidate**: Run `1. Authentication > Sign In as Candidate Bob (Bob Miller)`.
   - *Result*: Environment variable `{{token}}` switches to Bob's candidate token.
2. **Verify Invitation**: Run `4. Candidate Invitations > Verify Invitation Token (Candidate Endpoint)`.
   - *Result*: Verifies that Bob's authenticated email matches the invitation recipient.
3. **Start Attempt**: Run `5. Candidate Attempt Flow > 1. Start or Resume Attempt Session`.
   - *Result*: Locks start time, initializes countdown timer, scrubs answer keys/rubrics, and auto-saves `{{attemptId}}`.
4. **Inspect Session**: Run `5. Candidate Attempt Flow > 2. Get Current Attempt Session & Drafts`.
5. **Autosave Drafts**:
   - Run `5. Candidate Attempt Flow > 3. Autosave Answer Draft (Coding / Written)`.
6. **Submit Assessment**: Run `5. Candidate Attempt Flow > 4. Final Submit Assessment`.
   - *Result*: Locks attempt, performs automated MCQ grading, and queues subjective questions into `UNDER_REVIEW`.

---

### Phase 3: Recruiter Evaluation & Grading
1. **Switch back to Recruiter**: Run `1. Authentication > Sign In as Recruiter (Alex Rivera)`.
2. **View Evaluation Queue**: Run `6. Evaluation Queue & Scoring > 1. View Evaluation Queue`.
   - *Result*: Auto-saves pending `{{reviewId}}`.
3. **Inspect Submission & Rubric**: Run `6. Evaluation Queue & Scoring > 2. Get Evaluation Review Details & Rubric`.
   - *Result*: Auto-saves candidate's `{{submissionAnswerId}}`.
4. **Claim Review**: Run `6. Evaluation Queue & Scoring > 3. Claim Review`.
5. **Score Answer**: Run `6. Evaluation Queue & Scoring > 4. Score Individual Question with Rubric`.
   - *Result*: Awards points and comments against the rubric criteria.
6. **Finalize**: Run `6. Evaluation Queue & Scoring > 5. Finalize Evaluation`.
   - *Result*: Aggregates total scores, computes pass/fail status, and marks attempt as `COMPLETED`.

---

### Phase 4: Reports & Analytics
1. **Recruiter Cohort Summary**: Run `7. Reports & Analytics > Assessment Cohort Summary`.
   - *Result*: Returns total invitations, attempt distribution, pass rate, and question performance.
2. **Recruiter Candidate Scorecard**: Run `7. Reports & Analytics > Candidate Scorecard (Recruiter / Admin View)`.
3. **Candidate Self-Service**:
   - Run `1. Authentication > Sign In as Candidate Bob (Bob Miller)`.
   - Run `7. Reports & Analytics > Candidate Self-Service Scorecard (My Results)`.

---

## 🌐 Interactive Swagger UI Alternative

In addition to Postman, the backend provides an interactive browser documentation portal:
- **Interactive UI**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- **Raw OpenAPI 3.1 Spec**: [http://localhost:5000/api/docs/openapi.json](http://localhost:5000/api/docs/openapi.json)

You can also import `http://localhost:5000/api/docs/openapi.json` directly into Postman using **Import > Link**.

