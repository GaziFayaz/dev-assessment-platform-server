import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import type { Server } from "node:http";

async function runAssessmentVerification() {
  console.log("🚀 Starting Assessment Builder E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5051;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Healthcheck
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    const healthJson = (await healthRes.json()) as any;
    console.log("✅ 1. Healthcheck status:", healthJson.data?.status);

    // 2. Unauthenticated request to /api/v1/assessments (Must return 401)
    const unauthRes = await fetch(`${baseUrl}/api/v1/assessments`);
    console.log("✅ 2. Unauthenticated GET /assessments status (expect 401):", unauthRes.status);
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

    // 3. Authenticate as Recruiter
    const authResult = await auth.api.signInEmail({
      body: {
        email: "recruiter@techcorp.dev",
        password: "Password123!",
      },
    });
    const bearerToken = authResult.token;
    console.log("✅ 3. Authenticated as Recruiter:", authResult.user.email);

    // Find organization ID for techcorp
    const techcorpOrg = await prisma.organization.findUnique({ where: { slug: "techcorp" } });
    if (!techcorpOrg) throw new Error("TechCorp organization not found");
    const orgId = techcorpOrg.id;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
      authorization: `Bearer ${bearerToken}`,
    };

    // 4. List assessments (Should return seeded assessments)
    const listRes = await fetch(`${baseUrl}/api/v1/assessments?limit=10`, {
      headers: requestHeaders,
    });
    const listJson = (await listRes.json()) as any;
    console.log(
      `✅ 4. GET /assessments status: ${listRes.status}, items returned: ${listJson.data?.length}, total: ${listJson.meta?.totalItems}`
    );
    if (listRes.status !== 200 || !listJson.data || listJson.data.length < 3) {
      throw new Error(`Expected at least 3 seeded assessments, got: ${JSON.stringify(listJson)}`);
    }

    // 5. Test Filtering by Status (ACTIVE)
    const filterRes = await fetch(`${baseUrl}/api/v1/assessments?status=ACTIVE`, {
      headers: requestHeaders,
    });
    const filterJson = (await filterRes.json()) as any;
    console.log(
      `✅ 5. GET /assessments?status=ACTIVE count: ${filterJson.data?.length}, first title: ${filterJson.data?.[0]?.title}`
    );
    if (filterJson.data?.length !== 1 || filterJson.data?.[0]?.status !== "ACTIVE") {
      throw new Error(`Expected 1 active assessment, got ${JSON.stringify(filterJson)}`);
    }

    // 6. Create a draft assessment
    const createRes = await fetch(`${baseUrl}/api/v1/assessments`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        title: "Temporary E2E Assessment",
        description: "Created during automated assessment integration verification.",
        instructions: "Please complete all challenges.",
        durationMinutes: 45,
        passingScore: 30.0,
      }),
    });
    const createJson = (await createRes.json()) as any;
    console.log(
      `✅ 6. POST /assessments status: ${createRes.status}, id: ${createJson.data?.id}, status: ${createJson.data?.status}`
    );
    if (createRes.status !== 201 || createJson.data?.status !== "DRAFT") {
      throw new Error(`Failed to create assessment: ${JSON.stringify(createJson)}`);
    }
    const createdAssessmentId = createJson.data.id;

    // Fetch 2 existing problems from TechCorp
    const problems = await prisma.problem.findMany({
      where: { organizationId: orgId },
      take: 2,
    });
    if (problems.length < 2) throw new Error("Expected at least 2 problems in TechCorp problem bank");

    // 7. Add first problem to assessment draft
    const addProbRes1 = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/problems`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        problemId: problems[0].id,
        points: 20.0,
        orderIndex: 1,
      }),
    });
    const addProbJson1 = (await addProbRes1.json()) as any;
    console.log(
      `✅ 7. POST /assessments/:id/problems (prob 1) status: ${addProbRes1.status}, allocated points: ${addProbJson1.data?.points}`
    );
    if (addProbRes1.status !== 201) {
      throw new Error(`Failed to add problem 1: ${JSON.stringify(addProbJson1)}`);
    }

    // 8. Add second problem to assessment draft (omitting orderIndex to test auto-sequencing)
    const addProbRes2 = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/problems`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        problemId: problems[1].id,
        points: 25.0,
      }),
    });
    const addProbJson2 = (await addProbRes2.json()) as any;
    console.log(
      `✅ 8. POST /assessments/:id/problems (prob 2) status: ${addProbRes2.status}, auto orderIndex: ${addProbJson2.data?.orderIndex}`
    );
    if (addProbRes2.status !== 201 || addProbJson2.data?.orderIndex !== 2) {
      throw new Error(`Failed to auto-assign orderIndex 2: ${JSON.stringify(addProbJson2)}`);
    }

    // 9. Inspect single assessment and verify totalScore recalculation (20 + 25 = 45.0)
    const detailRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}`, {
      headers: requestHeaders,
    });
    const detailJson = (await detailRes.json()) as any;
    console.log(
      `✅ 9. GET /assessments/:id totalScore: ${detailJson.data?.totalScore} (expect 45), problems attached: ${detailJson.data?.problems?.length}`
    );
    if (detailJson.data?.totalScore !== 45.0 || detailJson.data?.problems?.length !== 2) {
      throw new Error(`Total score mismatch: expected 45.0, got ${detailJson.data?.totalScore}`);
    }

    // 10. Test Invalid State Transition (DRAFT -> ACTIVE directly must fail with 400)
    const invalidStatusRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/status`, {
      method: "PATCH",
      headers: requestHeaders,
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    console.log(
      `✅ 10. PATCH /assessments/:id/status (DRAFT -> ACTIVE invalid) status: ${invalidStatusRes.status} (expect 400)`
    );
    if (invalidStatusRes.status !== 400) {
      throw new Error(`Expected 400 for invalid status transition, got ${invalidStatusRes.status}`);
    }

    // 11. Transition status from DRAFT -> PUBLISHED
    const publishRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/status`, {
      method: "PATCH",
      headers: requestHeaders,
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    const publishJson = (await publishRes.json()) as any;
    console.log(
      `✅ 11. PATCH /assessments/:id/status (DRAFT -> PUBLISHED) status: ${publishRes.status}, new status: ${publishJson.data?.status}`
    );
    if (publishRes.status !== 200 || publishJson.data?.status !== "PUBLISHED") {
      throw new Error(`Failed to publish assessment: ${JSON.stringify(publishJson)}`);
    }

    // 12. Problem addition locked once PUBLISHED (Must fail with 409 Conflict)
    const lockedProbRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/problems`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        problemId: problems[0].id,
        points: 10,
      }),
    });
    console.log(
      `✅ 12. POST /assessments/:id/problems on PUBLISHED assessment (expect 409): ${lockedProbRes.status}`
    );
    if (lockedProbRes.status !== 409) {
      throw new Error(`Expected 409 Conflict when adding problem to PUBLISHED assessment, got ${lockedProbRes.status}`);
    }

    // 13. Transition status from PUBLISHED -> ACTIVE
    const activateRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/status`, {
      method: "PATCH",
      headers: requestHeaders,
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const activateJson = (await activateRes.json()) as any;
    console.log(`✅ 13. Transition to ACTIVE status: ${activateJson.data?.status}`);
    if (activateJson.data?.status !== "ACTIVE") throw new Error("Failed to transition to ACTIVE");

    // 14. Transition status from ACTIVE -> CLOSED
    const closeRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/status`, {
      method: "PATCH",
      headers: requestHeaders,
      body: JSON.stringify({ status: "CLOSED" }),
    });
    const closeJson = (await closeRes.json()) as any;
    console.log(`✅ 14. Transition to CLOSED status: ${closeJson.data?.status}`);
    if (closeJson.data?.status !== "CLOSED") throw new Error("Failed to transition to CLOSED");

    // 15. Transition status from CLOSED -> ARCHIVED
    const archiveRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}/status`, {
      method: "PATCH",
      headers: requestHeaders,
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const archiveJson = (await archiveRes.json()) as any;
    console.log(`✅ 15. Transition to ARCHIVED status: ${archiveJson.data?.status}`);
    if (archiveJson.data?.status !== "ARCHIVED") throw new Error("Failed to transition to ARCHIVED");

    // 16. Delete assessment (Safe since zero attempts were performed)
    const deleteRes = await fetch(`${baseUrl}/api/v1/assessments/${createdAssessmentId}`, {
      method: "DELETE",
      headers: requestHeaders,
    });
    const deleteJson = (await deleteRes.json()) as any;
    console.log(`✅ 16. DELETE /assessments/:id status: ${deleteRes.status}, deleted: ${deleteJson.data?.deleted}`);
    if (deleteRes.status !== 200 || !deleteJson.data?.deleted) {
      throw new Error(`Failed to delete assessment: ${JSON.stringify(deleteJson)}`);
    }

    console.log("\n=========================================");
    console.log("🎉 All Assessment Builder E2E Tests Passed Successfully!");
    console.log("=========================================\n");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAssessmentVerification().catch((err) => {
  console.error("\n❌ Assessment E2E Verification failed:", err);
  process.exit(1);
});
