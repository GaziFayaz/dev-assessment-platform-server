import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { AttemptStatus, EvaluationStatus } from "../generated/client/client.js";
import type { Server } from "node:http";

async function runEvaluationsVerification() {
  console.log("🚀 Starting Evaluation Queue & Review E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5054;
  const baseUrl = `http://localhost:${port}`;

  let testInvitationId: string | null = null;
  let testAttemptId: string | null = null;

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
    const unauthQueue = await fetch(`${baseUrl}/api/v1/evaluations/queue`);
    console.log("✅ 2. Unauthenticated GET /evaluations/queue status (expect 401):", unauthQueue.status);
    if (unauthQueue.status !== 401) throw new Error(`Expected 401, got ${unauthQueue.status}`);

    const unauthDetail = await fetch(`${baseUrl}/api/v1/evaluations/3fa85f64-5717-4562-b3fc-2c963f66afa6`);
    console.log("✅ 3. Unauthenticated GET /evaluations/:id status (expect 401):", unauthDetail.status);
    if (unauthDetail.status !== 401) throw new Error(`Expected 401, got ${unauthDetail.status}`);

    // -------------------------------------------------------------
    // 3. Candidate role guard (Must return 403 Forbidden)
    // -------------------------------------------------------------
    const candidateAuth = await auth.api.signInEmail({
      body: { email: "bob@candidate.dev", password: "Password123!" },
    });
    const candidateToken = candidateAuth.token;

    // Find TechCorp organization
    const techcorp = await prisma.organization.findUnique({
      where: { slug: "techcorp" },
    });
    if (!techcorp) throw new Error("TechCorp organization not found");
    const orgId = techcorp.id;

    const candidateRes = await fetch(`${baseUrl}/api/v1/evaluations/queue`, {
      headers: {
        authorization: `Bearer ${candidateToken}`,
        "x-organization-id": orgId,
      },
    });
    console.log("✅ 4. Candidate GET /evaluations/queue status (expect 403 Forbidden):", candidateRes.status);
    if (candidateRes.status !== 403) throw new Error(`Expected 403, got ${candidateRes.status}`);

    // -------------------------------------------------------------
    // 4. Authenticate as Recruiter
    // -------------------------------------------------------------
    const recruiterAuth = await auth.api.signInEmail({
      body: { email: "recruiter@techcorp.dev", password: "Password123!" },
    });
    const recruiterToken = recruiterAuth.token;
    const recruiterHeaders = {
      "Content-Type": "application/json",
      authorization: `Bearer ${recruiterToken}`,
      "x-organization-id": orgId,
    };
    console.log("✅ 5. Authenticated as Recruiter:", recruiterAuth.user.email);

    // -------------------------------------------------------------
    // 5. Missing x-organization-id header (Must return 400)
    // -------------------------------------------------------------
    const noOrgRes = await fetch(`${baseUrl}/api/v1/evaluations/queue`, {
      headers: {
        authorization: `Bearer ${recruiterToken}`,
      },
    });
    console.log("✅ 6. GET /evaluations/queue without org header (expect 400):", noOrgRes.status);
    if (noOrgRes.status !== 400) throw new Error(`Expected 400, got ${noOrgRes.status}`);

    // -------------------------------------------------------------
    // 6. Setup dedicated test assessment attempt & evaluation review
    // -------------------------------------------------------------
    const assessment = await prisma.assessment.findFirst({
      where: {
        organizationId: orgId,
        title: "Full Stack Engineering Assessment",
      },
      include: {
        problems: {
          include: { problem: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });
    if (!assessment) throw new Error("Full Stack Engineering Assessment not found");

    const candidateUser = await prisma.user.findUnique({
      where: { email: "alice@candidate.dev" },
    });
    if (!candidateUser) throw new Error("Alice user not found");

    // Create test invitation
    const testInvite = await prisma.candidateInvitation.create({
      data: {
        assessmentId: assessment.id,
        candidateEmail: candidateUser.email,
        candidateName: candidateUser.name,
        inviteToken: `e2e-eval-test-${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isAccepted: true,
      },
    });
    testInvitationId = testInvite.id;

    // Create test attempt in UNDER_REVIEW status
    const testAttempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id,
        invitationId: testInvite.id,
        candidateId: candidateUser.id,
        candidateEmail: candidateUser.email,
        status: AttemptStatus.UNDER_REVIEW,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        autoScore: 15.0,
        manualScore: 0.0,
        totalScore: 15.0,
        percentage: 0.0,
        isPassed: null,
        evaluationStatus: EvaluationStatus.PENDING,
      },
    });
    testAttemptId = testAttempt.id;

    // Seed answers for each problem
    let codingSubmissionAnswerId: string = "";
    let writtenSubmissionAnswerId: string = "";
    let totalAutoScore = 0.0;

    for (const ap of assessment.problems) {
      if (ap.problem.type === "MCQ_SINGLE" || ap.problem.type === "MCQ_MULTIPLE") {
        await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            selectedOptions: ["opt-1"],
            autoScore: ap.points,
            isCorrect: true,
          },
        });
        totalAutoScore += ap.points;
      } else if (ap.problem.type === "CODING") {
        const answer = await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            submittedCode: "function solve(arr) { return arr.sort((a,b) => a-b); }",
            selectedLanguage: "typescript",
          },
        });
        codingSubmissionAnswerId = answer.id;
      } else if (ap.problem.type === "WRITTEN") {
        const answer = await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            writtenAnswer: "Cache-aside pattern with TTL expiration and distributed invalidation bus.",
          },
        });
        writtenSubmissionAnswerId = answer.id;
      }
    }

    // Update attempt autoScore to match seeded MCQs
    await prisma.assessmentAttempt.update({
      where: { id: testAttempt.id },
      data: { autoScore: totalAutoScore, totalScore: totalAutoScore },
    });

    // Create EvaluationReview in PENDING status
    const testReview = await prisma.evaluationReview.create({
      data: {
        attemptId: testAttempt.id,
        evaluationStatus: EvaluationStatus.PENDING,
      },
    });
    const reviewId = testReview.id;
    console.log("✅ 7. Created isolated test evaluation review ID:", reviewId);

    // -------------------------------------------------------------
    // 7. GET /api/v1/evaluations/queue (List queue)
    // -------------------------------------------------------------
    const queueRes = await fetch(`${baseUrl}/api/v1/evaluations/queue?status=PENDING`, {
      headers: recruiterHeaders,
    });
    const queueJson = (await queueRes.json()) as any;
    console.log("✅ 8. GET /evaluations/queue status:", queueRes.status, "Items returned:", queueJson.data?.length);
    if (queueRes.status !== 200) throw new Error("Failed to list evaluation queue");
    const foundItem = queueJson.data?.find((item: any) => item.reviewId === reviewId);
    if (!foundItem) throw new Error("Test review not found in evaluation queue");
    if (foundItem.subjectiveQuestionsCount !== 2) {
      throw new Error(`Expected 2 subjective questions, got ${foundItem.subjectiveQuestionsCount}`);
    }

    // -------------------------------------------------------------
    // 8. GET /api/v1/evaluations/:reviewId (Inspect review detail)
    // -------------------------------------------------------------
    const detailRes = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}`, {
      headers: recruiterHeaders,
    });
    const detailJson = (await detailRes.json()) as any;
    console.log("✅ 9. GET /evaluations/:reviewId status:", detailRes.status);
    if (detailRes.status !== 200) throw new Error("Failed to get review detail");
    if (detailJson.data.reviewId !== reviewId) throw new Error("Mismatched reviewId");
    if (detailJson.data.questions.length !== assessment.problems.length) {
      throw new Error("Question count mismatch in review detail");
    }
    const codingQ = detailJson.data.questions.find((q: any) => q.type === "CODING");
    if (!codingQ || !codingQ.candidateAnswer.submittedCode) {
      throw new Error("Candidate submitted code missing from review detail");
    }
    const writtenQ = detailJson.data.questions.find((q: any) => q.type === "WRITTEN");
    if (!writtenQ || !writtenQ.candidateAnswer.writtenAnswer) {
      throw new Error("Candidate written answer missing from review detail");
    }
    console.log("   Found coding question:", codingQ.title, "Max points:", codingQ.points);
    console.log("   Found written question:", writtenQ.title, "Max points:", writtenQ.points);

    // -------------------------------------------------------------
    // 9. POST /api/v1/evaluations/:reviewId/claim (Claim review)
    // -------------------------------------------------------------
    const claimRes = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/claim`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({}),
    });
    const claimJson = (await claimRes.json()) as any;
    console.log("✅ 10. POST /evaluations/:reviewId/claim status:", claimRes.status, "Claimed:", claimJson.data?.claimed);
    if (claimRes.status !== 200 || claimJson.data?.evaluationStatus !== "IN_REVIEW") {
      throw new Error("Failed to claim evaluation review");
    }

    // -------------------------------------------------------------
    // 10. Premature Finalize Guard (Must fail with 400 Bad Request)
    // -------------------------------------------------------------
    const earlyFinalize = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/finalize`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({ overallFeedback: "Incomplete" }),
    });
    console.log("✅ 11. Finalize before scoring all questions status (expect 400):", earlyFinalize.status);
    if (earlyFinalize.status !== 400) throw new Error(`Expected 400, got ${earlyFinalize.status}`);

    // -------------------------------------------------------------
    // 11. Scoring Point Limits Guard (Must fail with 400 Bad Request)
    // -------------------------------------------------------------
    const invalidScore = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/score`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        submissionAnswerId: codingSubmissionAnswerId,
        awardedPoints: 9999.0, // Exceeds max points
        feedback: "Way too many points",
      }),
    });
    console.log("✅ 12. Score exceeding max points status (expect 400):", invalidScore.status);
    if (invalidScore.status !== 400) throw new Error(`Expected 400, got ${invalidScore.status}`);

    // -------------------------------------------------------------
    // 12. Score coding question with valid points (200 OK)
    // -------------------------------------------------------------
    const scoreRes1 = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/score`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        submissionAnswerId: codingSubmissionAnswerId,
        awardedPoints: 35.0,
        feedback: "Clean sorting implementation. Good time complexity analysis.",
      }),
    });
    const scoreJson1 = (await scoreRes1.json()) as any;
    console.log("✅ 13. POST /evaluations/:reviewId/score (coding) status:", scoreRes1.status, "Awarded:", scoreJson1.data?.awardedPoints);
    if (scoreRes1.status !== 200 || scoreJson1.data?.awardedPoints !== 35.0) {
      throw new Error("Failed to score coding question");
    }

    // Verify finalize still fails because written question remains unscored
    const midFinalize = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/finalize`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({}),
    });
    console.log("✅ 14. Finalize with 1 unscored question remaining status (expect 400):", midFinalize.status);
    if (midFinalize.status !== 400) throw new Error(`Expected 400, got ${midFinalize.status}`);

    // Score written question
    const scoreRes2 = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/score`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        submissionAnswerId: writtenSubmissionAnswerId,
        awardedPoints: 25.0,
        feedback: "Accurate architecture explanation for cache invalidation.",
      }),
    });
    const scoreJson2 = (await scoreRes2.json()) as any;
    console.log("✅ 15. POST /evaluations/:reviewId/score (written) status:", scoreRes2.status, "Awarded:", scoreJson2.data?.awardedPoints);
    if (scoreRes2.status !== 200 || scoreJson2.data?.awardedPoints !== 25.0) {
      throw new Error("Failed to score written question");
    }
    if (scoreJson2.data.attemptManualScore !== 60.0) {
      throw new Error(`Expected attemptManualScore 60.0 (35 + 25), got ${scoreJson2.data.attemptManualScore}`);
    }

    // -------------------------------------------------------------
    // 13. Finalize evaluation review (200 OK)
    // -------------------------------------------------------------
    const finalizeRes = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/finalize`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        overallFeedback: "Strong candidate with solid algorithms and systems knowledge.",
      }),
    });
    const finalizeJson = (await finalizeRes.json()) as any;
    console.log("✅ 16. POST /evaluations/:reviewId/finalize status:", finalizeRes.status);
    if (finalizeRes.status !== 200) throw new Error("Failed to finalize evaluation");
    console.log("   Final status:", finalizeJson.data?.attemptStatus, "Total score:", finalizeJson.data?.totalScore, "Percentage:", `${finalizeJson.data?.percentage}%`, "Passed:", finalizeJson.data?.isPassed);
    if (finalizeJson.data?.attemptStatus !== "COMPLETED") throw new Error("Attempt status not updated to COMPLETED");
    if (finalizeJson.data?.evaluationStatus !== "EVALUATED") throw new Error("Evaluation status not updated to EVALUATED");
    if (finalizeJson.data?.totalScore !== 90.0) throw new Error(`Expected totalScore 90.0 (30 auto + 60 manual), got ${finalizeJson.data?.totalScore}`);

    // -------------------------------------------------------------
    // 14. Immutability checks on finalized review (Expect 409 Conflict)
    // -------------------------------------------------------------
    const postFinalizeScore = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/score`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        submissionAnswerId: codingSubmissionAnswerId,
        awardedPoints: 10.0,
      }),
    });
    console.log("✅ 15. Score finalized review status (expect 409):", postFinalizeScore.status);
    if (postFinalizeScore.status !== 409) throw new Error(`Expected 409, got ${postFinalizeScore.status}`);

    const postFinalizeClaim = await fetch(`${baseUrl}/api/v1/evaluations/${reviewId}/claim`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({}),
    });
    console.log("✅ 16. Claim finalized review status (expect 409):", postFinalizeClaim.status);
    if (postFinalizeClaim.status !== 409) throw new Error(`Expected 409, got ${postFinalizeClaim.status}`);

    // -------------------------------------------------------------
    // 15. Queue status filter check (EVALUATED queue)
    // -------------------------------------------------------------
    const evaluatedQueueRes = await fetch(`${baseUrl}/api/v1/evaluations/queue?status=EVALUATED`, {
      headers: recruiterHeaders,
    });
    const evaluatedQueueJson = (await evaluatedQueueRes.json()) as any;
    const foundEvaluated = evaluatedQueueJson.data?.some((i: any) => i.reviewId === reviewId);
    console.log("✅ 17. Review present in EVALUATED queue filter:", foundEvaluated);
    if (!foundEvaluated) throw new Error("Review not found in EVALUATED queue filter");

  } finally {
    // -------------------------------------------------------------
    // Cleanup temporary test data
    // -------------------------------------------------------------
    if (testAttemptId) {
      await prisma.evaluationScore.deleteMany({
        where: { review: { attemptId: testAttemptId } },
      });
      await prisma.evaluationReview.deleteMany({
        where: { attemptId: testAttemptId },
      });
      await prisma.submissionAnswer.deleteMany({
        where: { attemptId: testAttemptId },
      });
      await prisma.assessmentAttempt.deleteMany({
        where: { id: testAttemptId },
      });
    }
    if (testInvitationId) {
      await prisma.candidateInvitation.deleteMany({
        where: { id: testInvitationId },
      });
    }
    console.log("✅ 18. Cleaned up isolated test evaluation and attempt data");

    server.close();
  }

  console.log("\n=========================================");
  console.log("🎉 All Evaluation Queue & Review E2E Tests Passed Successfully!");
  console.log("=========================================\n");
}

runEvaluationsVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ E2E Verification failed:", err);
    process.exit(1);
  });
