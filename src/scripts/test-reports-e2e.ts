import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { AttemptStatus, EvaluationStatus } from "../generated/client/client.js";
import type { Server } from "node:http";

async function runReportsVerification() {
  console.log("🚀 Starting Reports & Analytics E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5055;
  const baseUrl = `http://localhost:${port}`;

  let testInvitationId: string | null = null;
  let testCompletedAttemptId: string | null = null;

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
    const fakeUuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    const unauthSummary = await fetch(`${baseUrl}/api/v1/reports/assessments/${fakeUuid}/summary`);
    console.log("✅ 2. Unauthenticated GET /reports/assessments/:id/summary status (expect 401):", unauthSummary.status);
    if (unauthSummary.status !== 401) throw new Error(`Expected 401, got ${unauthSummary.status}`);

    const unauthAttempt = await fetch(`${baseUrl}/api/v1/reports/attempts/${fakeUuid}`);
    console.log("✅ 3. Unauthenticated GET /reports/attempts/:attemptId status (expect 401):", unauthAttempt.status);
    if (unauthAttempt.status !== 401) throw new Error(`Expected 401, got ${unauthAttempt.status}`);

    const unauthMyResults = await fetch(`${baseUrl}/api/v1/reports/candidate/my-results`);
    console.log("✅ 4. Unauthenticated GET /reports/candidate/my-results status (expect 401):", unauthMyResults.status);
    if (unauthMyResults.status !== 401) throw new Error(`Expected 401, got ${unauthMyResults.status}`);

    // -------------------------------------------------------------
    // 3. Candidate role guards (Recruiter endpoints must return 403)
    // -------------------------------------------------------------
    const candidateAuth = await auth.api.signInEmail({
      body: { email: "alice@candidate.dev", password: "Password123!" },
    });
    const candidateToken = candidateAuth.token;

    const techcorp = await prisma.organization.findUnique({
      where: { slug: "techcorp" },
    });
    if (!techcorp) throw new Error("TechCorp organization not found");
    const orgId = techcorp.id;

    const candidateSummaryRes = await fetch(`${baseUrl}/api/v1/reports/assessments/${fakeUuid}/summary`, {
      headers: {
        authorization: `Bearer ${candidateToken}`,
        "x-organization-id": orgId,
      },
    });
    console.log("✅ 5. Candidate GET /reports/assessments/:id/summary status (expect 403 Forbidden):", candidateSummaryRes.status);
    if (candidateSummaryRes.status !== 403) throw new Error(`Expected 403, got ${candidateSummaryRes.status}`);

    const candidateAttemptRes = await fetch(`${baseUrl}/api/v1/reports/attempts/${fakeUuid}`, {
      headers: {
        authorization: `Bearer ${candidateToken}`,
        "x-organization-id": orgId,
      },
    });
    console.log("✅ 6. Candidate GET /reports/attempts/:attemptId status (expect 403 Forbidden):", candidateAttemptRes.status);
    if (candidateAttemptRes.status !== 403) throw new Error(`Expected 403, got ${candidateAttemptRes.status}`);

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
    console.log("✅ 7. Authenticated as Recruiter:", recruiterAuth.user.email);

    // Missing organization header on recruiter endpoint (expect 400)
    const noOrgRes = await fetch(`${baseUrl}/api/v1/reports/assessments/${fakeUuid}/summary`, {
      headers: {
        authorization: `Bearer ${recruiterToken}`,
      },
    });
    console.log("✅ 8. GET summary without x-organization-id header (expect 400):", noOrgRes.status);
    if (noOrgRes.status !== 400) throw new Error(`Expected 400, got ${noOrgRes.status}`);

    // -------------------------------------------------------------
    // 5. Setup an isolated completed test attempt for testing
    // -------------------------------------------------------------
    const fullstackAssessment = await prisma.assessment.findFirst({
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
    if (!fullstackAssessment) throw new Error("Full Stack Engineering Assessment not found");

    const candidateUser = await prisma.user.findUnique({
      where: { email: "alice@candidate.dev" },
    });
    if (!candidateUser) throw new Error("Alice candidate user not found");

    // Create unique test invitation
    const testInviteToken = `test-report-token-${Date.now()}`;
    const testInvite = await prisma.candidateInvitation.create({
      data: {
        assessmentId: fullstackAssessment.id,
        candidateEmail: candidateUser.email,
        candidateName: candidateUser.name,
        inviteToken: testInviteToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isAccepted: true,
      },
    });
    testInvitationId = testInvite.id;

    // Create completed attempt
    const startedAt = new Date(Date.now() - 45 * 60 * 1000); // 45 mins ago
    const submittedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
    const testAttempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: fullstackAssessment.id,
        invitationId: testInvite.id,
        candidateId: candidateUser.id,
        candidateEmail: candidateUser.email,
        status: AttemptStatus.COMPLETED,
        evaluationStatus: EvaluationStatus.EVALUATED,
        startedAt,
        submittedAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
        autoScore: 15.0,
        manualScore: 70.0,
        totalScore: 85.0,
        percentage: 85.0,
        isPassed: true,
      },
    });
    testCompletedAttemptId = testAttempt.id;

    // Create EvaluationReview first so foreign key is satisfied
    const evalReview = await prisma.evaluationReview.create({
      data: {
        attemptId: testAttempt.id,
        evaluatorId: recruiterAuth.user.id,
        evaluationStatus: EvaluationStatus.EVALUATED,
        overallFeedback: "Outstanding engineering proficiency demonstrated throughout.",
        evaluatedAt: new Date(),
      },
    });

    // Add answers & evaluation scores for problems
    for (const ap of fullstackAssessment.problems) {
      if (ap.problem.type === "MCQ_SINGLE" || ap.problem.type === "MCQ_MULTIPLE") {
        const opts = (ap.problem.mcqOptions as any[]) || [];
        const correctOpt = opts.find((o: any) => o.isCorrect === true);
        const optId = correctOpt ? correctOpt.id : "opt-1";

        await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            selectedOptions: [optId],
            autoScore: ap.points,
            isCorrect: true,
          },
        });
      } else if (ap.problem.type === "CODING") {
        const ans = await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            submittedCode: "function lruCache() { return true; }",
            selectedLanguage: "typescript",
            autoScore: 0.0,
            isCorrect: null,
          },
        });

        await prisma.evaluationScore.create({
          data: {
            submissionAnswerId: ans.id,
            reviewId: evalReview.id,
            awardedPoints: 35.0,
            maxPoints: ap.points,
            feedback: "Clean TypeScript implementation with optimal complexity.",
          },
        });
      } else if (ap.problem.type === "WRITTEN") {
        const ans = await prisma.submissionAnswer.create({
          data: {
            attemptId: testAttempt.id,
            problemId: ap.problem.id,
            writtenAnswer: "Distributed caching leverages consistent hashing and cache-aside...",
            autoScore: 0.0,
            isCorrect: null,
          },
        });

        await prisma.evaluationScore.create({
          data: {
            submissionAnswerId: ans.id,
            reviewId: evalReview.id,
            awardedPoints: 35.0,
            maxPoints: ap.points,
            feedback: "Comprehensive explanation of cache invalidation strategies.",
          },
        });
      }
    }

    console.log("✅ 9. Setup completed test attempt ID:", testAttempt.id);

    // -------------------------------------------------------------
    // 6. Test GET /api/v1/reports/assessments/:id/summary
    // -------------------------------------------------------------
    const summaryRes = await fetch(
      `${baseUrl}/api/v1/reports/assessments/${fullstackAssessment.id}/summary`,
      { headers: recruiterHeaders }
    );
    const summaryJson = (await summaryRes.json()) as any;
    console.log("✅ 10. GET /assessments/:id/summary status:", summaryRes.status);
    if (summaryRes.status !== 200) {
      throw new Error(`Expected 200, got ${summaryRes.status}: ${JSON.stringify(summaryJson)}`);
    }

    const summaryData = summaryJson.data;
    console.log("   Assessment title:", summaryData.assessment.title);
    console.log("   Total attempts:", summaryData.cohortMetrics.totalAttempts);
    console.log("   Completed candidates:", summaryData.performanceStats.completedCandidates);
    console.log("   Pass rate:", summaryData.performanceStats.passRate, "%");
    console.log("   Average score:", summaryData.performanceStats.averageScore);
    console.log("   Median score:", summaryData.performanceStats.medianScore);
    console.log("   Distribution buckets count:", summaryData.scoreDistribution.length);
    console.log("   Questions benchmarked:", summaryData.questionsPerformance.length);

    if (!summaryData.performanceStats || summaryData.performanceStats.completedCandidates < 1) {
      throw new Error("Expected at least 1 completed candidate in performance stats");
    }
    if (summaryData.scoreDistribution.length !== 5) {
      throw new Error("Expected exactly 5 score distribution buckets");
    }
    if (summaryData.questionsPerformance.length !== fullstackAssessment.problems.length) {
      throw new Error("Expected question performance count to match attached problems count");
    }

    // -------------------------------------------------------------
    // 7. Test GET /api/v1/reports/attempts/:attemptId (Recruiter view)
    // -------------------------------------------------------------
    const attemptReportRes = await fetch(
      `${baseUrl}/api/v1/reports/attempts/${testAttempt.id}`,
      { headers: recruiterHeaders }
    );
    const attemptReportJson = (await attemptReportRes.json()) as any;
    console.log("✅ 11. GET /reports/attempts/:attemptId status:", attemptReportRes.status);
    if (attemptReportRes.status !== 200) {
      throw new Error(`Expected 200, got ${attemptReportRes.status}: ${JSON.stringify(attemptReportJson)}`);
    }

    const reportData = attemptReportJson.data;
    console.log("   Candidate:", reportData.candidate.email);
    console.log("   Total score:", reportData.scores.totalScore, "/", reportData.scores.totalPossibleScore);
    console.log("   Evaluator:", reportData.evaluation?.evaluatorEmail);
    console.log("   Overall feedback:", reportData.evaluation?.overallFeedback);
    console.log("   Questions reported:", reportData.questions.length);

    if (reportData.scores.totalScore !== 85.0) {
      throw new Error(`Expected totalScore 85.0, got ${reportData.scores.totalScore}`);
    }
    if (!reportData.evaluation || !reportData.evaluation.overallFeedback) {
      throw new Error("Expected evaluation review feedback in recruiter report");
    }

    // Verify rubrics are visible in recruiter report
    const codingQ = reportData.questions.find((q: any) => q.type === "CODING");
    if (!codingQ || codingQ.evaluationRubric === undefined) {
      throw new Error("Expected evaluationRubric to be present in recruiter report for coding question");
    }
    console.log("   Recruiter view rubric verified on coding question:", !!codingQ.evaluationRubric);

    // -------------------------------------------------------------
    // 8. Test in-progress attempt guard (Must reject with 400)
    // -------------------------------------------------------------
    // Create an explicit in-progress attempt to test the guard
    const testInProgressAttempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: fullstackAssessment.id,
        candidateId: candidateUser.id,
        candidateEmail: candidateUser.email,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    try {
      const inProgressRes = await fetch(
        `${baseUrl}/api/v1/reports/attempts/${testInProgressAttempt.id}`,
        { headers: recruiterHeaders }
      );
      console.log("✅ 12. GET attempt report for IN_PROGRESS attempt status (expect 400):", inProgressRes.status);
      if (inProgressRes.status !== 400) {
        throw new Error(`Expected 400 Bad Request for in-progress attempt, got ${inProgressRes.status}`);
      }
    } finally {
      await prisma.assessmentAttempt.delete({ where: { id: testInProgressAttempt.id } });
    }

    // -------------------------------------------------------------
    // 9. Test GET /api/v1/reports/candidate/my-results (Candidate view)
    // -------------------------------------------------------------
    const myResultsRes = await fetch(`${baseUrl}/api/v1/reports/candidate/my-results`, {
      headers: {
        authorization: `Bearer ${candidateToken}`,
      },
    });
    const myResultsJson = (await myResultsRes.json()) as any;
    console.log("✅ 13. Candidate GET /reports/candidate/my-results status:", myResultsRes.status);
    if (myResultsRes.status !== 200) {
      throw new Error(`Expected 200, got ${myResultsRes.status}: ${JSON.stringify(myResultsJson)}`);
    }

    const candidateResults = myResultsJson.data?.results || [];
    console.log("   Candidate completed results count:", candidateResults.length);
    if (candidateResults.length < 1) {
      throw new Error("Expected at least 1 completed result for Alice");
    }

    const myAttemptCard = candidateResults.find((r: any) => r.attemptId === testAttempt.id);
    if (!myAttemptCard) {
      throw new Error("Expected test attempt to be present in candidate's personal results");
    }

    console.log("   Assessment Title:", myAttemptCard.assessmentTitle);
    console.log("   Organization:", myAttemptCard.organizationName);
    console.log("   Score:", myAttemptCard.totalScore, "Percentage:", myAttemptCard.percentage);
    console.log("   Passed:", myAttemptCard.isPassed);

    // Verify Anti-cheating: evaluationRubric MUST NOT be present
    for (const q of myAttemptCard.questions) {
      if ((q as any).evaluationRubric !== undefined) {
        throw new Error(`Security breach: evaluationRubric leaked to candidate in question ${q.problemId}`);
      }
      if ((q as any).mcqOptions !== undefined) {
        throw new Error(`Security breach: mcqOptions leaked to candidate in question ${q.problemId}`);
      }
    }
    console.log("✅ 14. Anti-cheating verified: zero evaluationRubric or MCQ options leaked to candidate.");

    // -------------------------------------------------------------
    // 10. Non-existent / cross-tenant assessment (Must return 404)
    // -------------------------------------------------------------
    const notFoundSummary = await fetch(
      `${baseUrl}/api/v1/reports/assessments/00000000-0000-0000-0000-000000000000/summary`,
      { headers: recruiterHeaders }
    );
    console.log("✅ 15. GET summary for non-existent assessment status (expect 404):", notFoundSummary.status);
    if (notFoundSummary.status !== 404) throw new Error(`Expected 404, got ${notFoundSummary.status}`);

    const notFoundAttempt = await fetch(
      `${baseUrl}/api/v1/reports/attempts/00000000-0000-0000-0000-000000000000`,
      { headers: recruiterHeaders }
    );
    console.log("✅ 16. GET attempt report for non-existent attempt status (expect 404):", notFoundAttempt.status);
    if (notFoundAttempt.status !== 404) throw new Error(`Expected 404, got ${notFoundAttempt.status}`);

    console.log("\n=========================================");
    console.log("🎉 All Reports & Analytics E2E Tests Passed Successfully!");
    console.log("=========================================\n");
  } catch (error) {
    console.error("\n❌ Reports & Analytics verification failed:", error);
    throw error;
  } finally {
    // Clean up isolated test data
    if (testCompletedAttemptId) {
      try {
        await prisma.evaluationScore.deleteMany({
          where: { review: { attemptId: testCompletedAttemptId } },
        });
        await prisma.evaluationReview.deleteMany({
          where: { attemptId: testCompletedAttemptId },
        });
        await prisma.submissionAnswer.deleteMany({
          where: { attemptId: testCompletedAttemptId },
        });
        await prisma.assessmentAttempt.delete({
          where: { id: testCompletedAttemptId },
        });
      } catch (e) {
        console.warn("Cleanup error for attempt:", e);
      }
    }

    if (testInvitationId) {
      try {
        await prisma.candidateInvitation.delete({
          where: { id: testInvitationId },
        });
      } catch (e) {
        console.warn("Cleanup error for invitation:", e);
      }
    }

    await prisma.$disconnect();
    server.close();
  }
}

runReportsVerification()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
