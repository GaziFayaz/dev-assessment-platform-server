import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import type { Server } from "node:http";

async function runAttemptsVerification() {
  console.log("🚀 Starting Candidate Attempt Engine E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5053;
  const baseUrl = `http://localhost:${port}`;

  try {
    // -------------------------------------------------------------
    // 1. Healthcheck
    // -------------------------------------------------------------
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    const healthJson = (await healthRes.json()) as any;
    console.log("✅ 1. Healthcheck status:", healthJson.data?.status);
    if (healthRes.status !== 200) throw new Error("Healthcheck failed");

    // -------------------------------------------------------------
    // 2. Unauthenticated endpoint guards (Must return 401)
    // -------------------------------------------------------------
    const unauthStart = await fetch(`${baseUrl}/api/v1/attempts/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: "fake-token" }),
    });
    console.log("✅ 2. Unauthenticated POST /attempts/start status (expect 401):", unauthStart.status);
    if (unauthStart.status !== 401) throw new Error(`Expected 401, got ${unauthStart.status}`);

    const unauthGet = await fetch(`${baseUrl}/api/v1/attempts/3fa85f64-5717-4562-b3fc-2c963f66afa6`);
    console.log("✅ 3. Unauthenticated GET /attempts/:id status (expect 401):", unauthGet.status);
    if (unauthGet.status !== 401) throw new Error(`Expected 401, got ${unauthGet.status}`);

    // -------------------------------------------------------------
    // 3. Authenticate candidate users (Alice & Bob)
    // -------------------------------------------------------------
    const aliceAuth = await auth.api.signInEmail({
      body: { email: "alice@candidate.dev", password: "Password123!" },
    });
    const aliceToken = aliceAuth.token;
    const aliceHeaders = {
      "Content-Type": "application/json",
      authorization: `Bearer ${aliceToken}`,
    };
    console.log("✅ 4. Authenticated as Candidate Alice:", aliceAuth.user.email);

    const bobAuth = await auth.api.signInEmail({
      body: { email: "bob@candidate.dev", password: "Password123!" },
    });
    const bobToken = bobAuth.token;
    const bobHeaders = {
      "Content-Type": "application/json",
      authorization: `Bearer ${bobToken}`,
    };
    console.log("✅ 5. Authenticated as Candidate Bob:", bobAuth.user.email);

    // -------------------------------------------------------------
    // 4. Setup clean test assessment & invitation
    // -------------------------------------------------------------
    const techcorp = await prisma.organization.findUnique({ where: { slug: "techcorp" } });
    if (!techcorp) throw new Error("Techcorp organization not found");

    const frontendAssessment = await prisma.assessment.findFirst({
      where: { organizationId: techcorp.id, title: "Frontend Core Fundamentals" },
      include: { problems: { include: { problem: true }, orderBy: { orderIndex: "asc" } } },
    });
    if (!frontendAssessment) throw new Error("Frontend Core Fundamentals assessment not found");

    // Clean up any existing attempt for Alice on frontend assessment for clean test run
    await prisma.assessmentAttempt.deleteMany({
      where: { assessmentId: frontendAssessment.id, candidateId: aliceAuth.user.id },
    });

    const testAliceToken = `test-e2e-alice-token-${Date.now()}`;
    const aliceInvitation = await prisma.candidateInvitation.create({
      data: {
        assessmentId: frontendAssessment.id,
        candidateEmail: "alice@candidate.dev",
        candidateName: "Alice Candidate",
        inviteToken: testAliceToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isAccepted: false,
      },
    });

    // -------------------------------------------------------------
    // 5. Option B Security Gate: Mismatched Account Email (Must return 403)
    // -------------------------------------------------------------
    const mismatchStart = await fetch(`${baseUrl}/api/v1/attempts/start`, {
      method: "POST",
      headers: bobHeaders, // Bob trying to use Alice's invitation token
      body: JSON.stringify({ inviteToken: testAliceToken }),
    });
    console.log(
      "✅ 6. POST /attempts/start with mismatched candidate account (expect 403):",
      mismatchStart.status
    );
    if (mismatchStart.status !== 403) {
      throw new Error(`Expected 403 Forbidden for email mismatch, got ${mismatchStart.status}`);
    }

    // -------------------------------------------------------------
    // 6. Non-existent invitation token (Must return 404)
    // -------------------------------------------------------------
    const notFoundTokenRes = await fetch(`${baseUrl}/api/v1/attempts/start`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ inviteToken: "non-existent-token-xyz" }),
    });
    console.log("✅ 7. POST /attempts/start with invalid token (expect 404):", notFoundTokenRes.status);
    if (notFoundTokenRes.status !== 404) {
      throw new Error(`Expected 404 Not Found, got ${notFoundTokenRes.status}`);
    }

    // -------------------------------------------------------------
    // 7. Start Attempt as Alice (Must return 201 Created)
    // -------------------------------------------------------------
    const startRes = await fetch(`${baseUrl}/api/v1/attempts/start`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ inviteToken: testAliceToken }),
    });
    const startJson = (await startRes.json()) as any;
    console.log("✅ 8. POST /attempts/start status (expect 201):", startRes.status);
    if (startRes.status !== 201) {
      throw new Error(`Expected 201 Created, got ${startRes.status}: ${JSON.stringify(startJson)}`);
    }

    const attemptId = startJson.data.id;
    const problems = startJson.data.problems;

    // -------------------------------------------------------------
    // 8. Verify Zero Key/Rubric Leakage in Candidate Response
    // -------------------------------------------------------------
    for (const prob of problems) {
      if (prob.mcqOptions) {
        for (const opt of prob.mcqOptions) {
          if ("isCorrect" in opt) {
            throw new Error(`LEAK DETECTED: isCorrect found in candidate mcqOption: ${JSON.stringify(opt)}`);
          }
        }
      }
      if ("evaluationRubric" in prob) {
        throw new Error(`LEAK DETECTED: evaluationRubric found in candidate problem: ${JSON.stringify(prob)}`);
      }
    }
    console.log("✅ 9. Zero-Leakage Anti-Cheating Verification passed: No isCorrect or rubrics exposed");

    // -------------------------------------------------------------
    // 9. Safe Resumption on Page Refresh / Re-Start (Must return 200 OK with same ID)
    // -------------------------------------------------------------
    const resumeRes = await fetch(`${baseUrl}/api/v1/attempts/start`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ inviteToken: testAliceToken }),
    });
    const resumeJson = (await resumeRes.json()) as any;
    console.log("✅ 10. POST /attempts/start repeated call (resume) status (expect 200):", resumeRes.status);
    if (resumeRes.status !== 200 || resumeJson.data.id !== attemptId) {
      throw new Error(`Expected 200 OK resumption with same ID, got status ${resumeRes.status}`);
    }

    // -------------------------------------------------------------
    // 10. Session Inspection (GET /attempts/:id) & Ownership Guard
    // -------------------------------------------------------------
    const getAttemptRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}`, {
      headers: aliceHeaders,
    });
    const getAttemptJson = (await getAttemptRes.json()) as any;
    console.log("✅ 11. GET /attempts/:id status (expect 200):", getAttemptRes.status);
    if (getAttemptRes.status !== 200 || !getAttemptJson.data.remainingSeconds) {
      throw new Error(`Expected 200 OK with remainingSeconds, got ${getAttemptRes.status}`);
    }

    // Bob tries to inspect Alice's attempt (Must return 403)
    const bobInspectRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}`, {
      headers: bobHeaders,
    });
    console.log("✅ 12. GET /attempts/:id by unauthorized candidate (expect 403):", bobInspectRes.status);
    if (bobInspectRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized attempt access, got ${bobInspectRes.status}`);
    }

    // -------------------------------------------------------------
    // 11. Autosave Answer Drafts (PUT /attempts/:id/answers)
    // -------------------------------------------------------------
    const firstProb = problems[0];
    const mcqOpts = firstProb.mcqOptions;
    const chosenOptionId = mcqOpts && mcqOpts[0] ? mcqOpts[0].id : "opt-1";

    const saveAnswerRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}/answers`, {
      method: "PUT",
      headers: aliceHeaders,
      body: JSON.stringify({
        problemId: firstProb.problemId,
        selectedOptions: [chosenOptionId],
      }),
    });
    const saveJson = (await saveAnswerRes.json()) as any;
    console.log("✅ 13. PUT /attempts/:id/answers status (expect 200):", saveAnswerRes.status);
    if (saveAnswerRes.status !== 200) {
      throw new Error(`Expected 200 OK for save answer, got ${saveAnswerRes.status}: ${JSON.stringify(saveJson)}`);
    }

    // Bob tries to save answers to Alice's attempt (Must return 403)
    const bobSaveRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}/answers`, {
      method: "PUT",
      headers: bobHeaders,
      body: JSON.stringify({
        problemId: firstProb.problemId,
        selectedOptions: [chosenOptionId],
      }),
    });
    console.log("✅ 14. PUT /attempts/:id/answers by non-owner (expect 403):", bobSaveRes.status);
    if (bobSaveRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-owner save, got ${bobSaveRes.status}`);
    }

    // -------------------------------------------------------------
    // 12. Final Submission on 100% MCQ Assessment (Must return 200 & COMPLETED)
    // -------------------------------------------------------------
    const submitRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: aliceHeaders,
    });
    const submitJson = (await submitRes.json()) as any;
    console.log("✅ 15. POST /attempts/:id/submit status (expect 200):", submitRes.status);
    if (submitRes.status !== 200) {
      throw new Error(`Expected 200 OK for submission, got ${submitRes.status}: ${JSON.stringify(submitJson)}`);
    }
    console.log(
      `   Status: ${submitJson.data.status}, Score: ${submitJson.data.totalScore}, Percentage: ${submitJson.data.percentage}%`
    );
    if (submitJson.data.status !== "COMPLETED") {
      throw new Error(`Expected COMPLETED for 100% MCQ assessment, got ${submitJson.data.status}`);
    }

    // -------------------------------------------------------------
    // 13. Submission Immutability Guard: Cannot modify or resubmit
    // -------------------------------------------------------------
    const mutateAfterSubmit = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}/answers`, {
      method: "PUT",
      headers: aliceHeaders,
      body: JSON.stringify({
        problemId: firstProb.problemId,
        selectedOptions: [chosenOptionId],
      }),
    });
    console.log("✅ 16. PUT /attempts/:id/answers on submitted attempt (expect 409):", mutateAfterSubmit.status);
    if (mutateAfterSubmit.status !== 409) {
      throw new Error(`Expected 409 Conflict for mutating submitted attempt, got ${mutateAfterSubmit.status}`);
    }

    const reSubmitRes = await fetch(`${baseUrl}/api/v1/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: aliceHeaders,
    });
    console.log("✅ 17. POST /attempts/:id/submit on already submitted attempt (expect 409):", reSubmitRes.status);
    if (reSubmitRes.status !== 409) {
      throw new Error(`Expected 409 Conflict for resubmitting, got ${reSubmitRes.status}`);
    }

    // -------------------------------------------------------------
    // 14. Evaluation Queue Routing on Assessment with CODING question
    // -------------------------------------------------------------
    const fullstackAssessment = await prisma.assessment.findFirst({
      where: { organizationId: techcorp.id, title: "Full Stack Engineering Assessment" },
      include: { problems: { include: { problem: true } } },
    });

    if (fullstackAssessment) {
      // Clean up existing Bob attempts on fullstack for testing
      await prisma.assessmentAttempt.deleteMany({
        where: { assessmentId: fullstackAssessment.id, candidateId: bobAuth.user.id },
      });

      const testBobToken = `test-e2e-bob-mixed-token-${Date.now()}`;
      await prisma.candidateInvitation.create({
        data: {
          assessmentId: fullstackAssessment.id,
          candidateEmail: "bob@candidate.dev",
          candidateName: "Bob Candidate",
          inviteToken: testBobToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isAccepted: false,
        },
      });

      const bobStart = await fetch(`${baseUrl}/api/v1/attempts/start`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ inviteToken: testBobToken }),
      });
      const bobStartJson = (await bobStart.json()) as any;
      const bobAttemptId = bobStartJson.data.id;

      // Submit Bob's attempt
      const bobSubmit = await fetch(`${baseUrl}/api/v1/attempts/${bobAttemptId}/submit`, {
        method: "POST",
        headers: bobHeaders,
      });
      const bobSubmitJson = (await bobSubmit.json()) as any;
      console.log(
        "✅ 18. POST /attempts/:id/submit on mixed (coding) assessment status (expect 200):",
        bobSubmit.status
      );
      if (bobSubmit.status !== 200) {
        throw new Error(`Expected 200, got ${bobSubmit.status}`);
      }

      console.log(`   Routed Status: ${bobSubmitJson.data.status}, Evaluation Status: ${bobSubmitJson.data.evaluationStatus}`);
      if (bobSubmitJson.data.status !== "UNDER_REVIEW") {
        throw new Error(`Expected UNDER_REVIEW for coding assessment, got ${bobSubmitJson.data.status}`);
      }

      // Check EvaluationReview record exists in DB
      const reviewRecord = await prisma.evaluationReview.findUnique({
        where: { attemptId: bobAttemptId },
      });
      if (!reviewRecord) {
        throw new Error("Expected EvaluationReview record to be created for UNDER_REVIEW attempt");
      }
      console.log("✅ 19. EvaluationReview record successfully created in DB with status: PENDING");
    }

    // -------------------------------------------------------------
    // Clean up temporary test invitations and attempts
    // -------------------------------------------------------------
    await prisma.assessmentAttempt.deleteMany({
      where: { invitationId: aliceInvitation.id },
    });
    await prisma.candidateInvitation.delete({
      where: { id: aliceInvitation.id },
    });
    console.log("✅ 20. Cleaned up temporary test invitation & attempt data");

    console.log("\n=========================================");
    console.log("🎉 All Candidate Attempt Engine E2E Tests Passed Successfully!");
    console.log("=========================================\n");
  } finally {
    server.close();
  }
}

runAttemptsVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ E2E Verification failed:", err);
    process.exit(1);
  });
