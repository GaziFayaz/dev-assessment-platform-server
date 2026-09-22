import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import type { Server } from "node:http";

async function runInvitationVerification() {
  console.log("🚀 Starting Candidate Invitations E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5052;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Healthcheck
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    const healthJson = (await healthRes.json()) as any;
    console.log("✅ 1. Healthcheck status:", healthJson.data?.status);

    // 2. Unauthenticated request to /api/v1/assessments/:id/invitations (Must return 401)
    const unauthRes = await fetch(`${baseUrl}/api/v1/assessments/3fa85f64-5717-4562-b3fc-2c963f66afa6/invitations`);
    console.log("✅ 2. Unauthenticated GET /assessments/:id/invitations status (expect 401):", unauthRes.status);
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

    // 3. Unauthenticated request to /api/v1/invitations/verify/:token (Must return 401)
    const unauthVerifyRes = await fetch(`${baseUrl}/api/v1/invitations/verify/sample-token`);
    console.log("✅ 3. Unauthenticated GET /invitations/verify/:token status (expect 401):", unauthVerifyRes.status);
    if (unauthVerifyRes.status !== 401) throw new Error(`Expected 401, got ${unauthVerifyRes.status}`);

    // 4. Authenticate as Recruiter
    const recruiterAuth = await auth.api.signInEmail({
      body: {
        email: "recruiter@techcorp.dev",
        password: "Password123!",
      },
    });
    const recruiterToken = recruiterAuth.token;
    console.log("✅ 4. Authenticated as Recruiter:", recruiterAuth.user.email);

    // Find organization ID for techcorp
    const techcorpOrg = await prisma.organization.findUnique({ where: { slug: "techcorp" } });
    if (!techcorpOrg) throw new Error("TechCorp organization not found");
    const orgId = techcorpOrg.id;

    const recruiterHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
      authorization: `Bearer ${recruiterToken}`,
    };

    // Find a DRAFT assessment and an ACTIVE assessment
    const draftAssessment = await prisma.assessment.findFirst({
      where: { organizationId: orgId, status: "DRAFT" },
    });
    const activeAssessment = await prisma.assessment.findFirst({
      where: { organizationId: orgId, status: "ACTIVE" },
    });

    if (!draftAssessment || !activeAssessment) {
      throw new Error("Missing seeded assessments (need at least 1 DRAFT and 1 ACTIVE)");
    }

    // 5. Test Assessment Lifecycle Guard: Cannot invite to DRAFT assessment (Must return 409 Conflict)
    const draftInviteRes = await fetch(`${baseUrl}/api/v1/assessments/${draftAssessment.id}/invitations`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        candidateEmail: "draft-test@example.com",
        candidateName: "Draft Candidate",
      }),
    });
    console.log(
      `✅ 5. POST /assessments/:id/invitations on DRAFT assessment (expect 409): ${draftInviteRes.status}`
    );
    if (draftInviteRes.status !== 409) {
      throw new Error(`Expected 409 Conflict for DRAFT assessment invites, got ${draftInviteRes.status}`);
    }

    // 6. Send Bulk Candidate Invitations to ACTIVE Assessment
    const bulkInviteRes = await fetch(`${baseUrl}/api/v1/assessments/${activeAssessment.id}/invitations`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        invitations: [
          { candidateEmail: "bulk-test-1@example.com", candidateName: "Bulk One" },
          { candidateEmail: "bulk-test-2@example.com", candidateName: "Bulk Two" },
        ],
        defaultExpiresInDays: 14,
      }),
    });
    const bulkJson = (await bulkInviteRes.json()) as any;
    console.log(
      `✅ 6. POST /assessments/:id/invitations (bulk) status: ${bulkInviteRes.status}, sentCount: ${bulkJson.data?.sentCount}`
    );
    if (bulkInviteRes.status !== 201 || bulkJson.data?.sentCount !== 2) {
      throw new Error(`Failed to send bulk invitations: ${JSON.stringify(bulkJson)}`);
    }

    // 7. Send Single Candidate Invitation using simplified payload
    const singleInviteRes = await fetch(`${baseUrl}/api/v1/assessments/${activeAssessment.id}/invitations`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        candidateEmail: "single-test@example.com",
        candidateName: "Single Candidate",
      }),
    });
    const singleJson = (await singleInviteRes.json()) as any;
    console.log(
      `✅ 7. POST /assessments/:id/invitations (single) status: ${singleInviteRes.status}, token generated: ${singleJson.data?.invitations?.[0]?.inviteToken ? "YES" : "NO"}`
    );
    if (singleInviteRes.status !== 201 || singleJson.data?.sentCount !== 1) {
      throw new Error(`Failed to send single invitation: ${JSON.stringify(singleJson)}`);
    }

    // 8. Test Invitation Renewal / Idempotent Re-Invite
    const reInviteRes = await fetch(`${baseUrl}/api/v1/assessments/${activeAssessment.id}/invitations`, {
      method: "POST",
      headers: recruiterHeaders,
      body: JSON.stringify({
        candidateEmail: "single-test@example.com",
        candidateName: "Single Candidate Updated",
      }),
    });
    const reInviteJson = (await reInviteRes.json()) as any;
    console.log(
      `✅ 8. Re-inviting existing unstarted candidate (renewal) status: ${reInviteRes.status}, count: ${reInviteJson.data?.sentCount}`
    );
    if (reInviteRes.status !== 201) {
      throw new Error(`Failed to renew invitation: ${JSON.stringify(reInviteJson)}`);
    }

    // 9. List sent invitations for the assessment
    const listRes = await fetch(`${baseUrl}/api/v1/assessments/${activeAssessment.id}/invitations?limit=10`, {
      headers: recruiterHeaders,
    });
    const listJson = (await listRes.json()) as any;
    console.log(
      `✅ 9. GET /assessments/:id/invitations status: ${listRes.status}, totalItems: ${listJson.meta?.totalItems}`
    );
    if (listRes.status !== 200 || !listJson.data || listJson.data.length < 3) {
      throw new Error(`Expected at least 3 invitations, got ${listJson.data?.length}`);
    }

    // 10. Filter invitations by status (INVITED)
    const filterRes = await fetch(
      `${baseUrl}/api/v1/assessments/${activeAssessment.id}/invitations?status=INVITED`,
      { headers: recruiterHeaders }
    );
    const filterJson = (await filterRes.json()) as any;
    console.log(
      `✅ 10. GET /assessments/:id/invitations?status=INVITED count: ${filterJson.data?.length}`
    );
    if (filterRes.status !== 200 || !filterJson.data || filterJson.data.length < 1) {
      throw new Error(`Status filtering failed: ${JSON.stringify(filterJson)}`);
    }

    // 11. Authenticate as Alice (Seed Candidate)
    const aliceAuth = await auth.api.signInEmail({
      body: {
        email: "alice@candidate.dev",
        password: "Password123!",
      },
    });
    const aliceToken = aliceAuth.token;
    console.log("✅ 11. Authenticated as Candidate Alice:", aliceAuth.user.email);

    // 12. Verify Token as Matching Candidate (Alice verifying Alice's token)
    const aliceVerifyRes = await fetch(
      `${baseUrl}/api/v1/invitations/verify/alice-frontend-fundamentals-token-demo`,
      {
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      }
    );
    const aliceVerifyJson = (await aliceVerifyRes.json()) as any;
    console.log(
      `✅ 12. GET /invitations/verify/:token (matching candidate) status: ${aliceVerifyRes.status}, canStart: ${aliceVerifyJson.data?.canStart}, assessment: ${aliceVerifyJson.data?.assessment?.title}`
    );
    if (aliceVerifyRes.status !== 200 || !aliceVerifyJson.data?.canStart) {
      throw new Error(`Candidate token verification failed: ${JSON.stringify(aliceVerifyJson)}`);
    }

    // 13. Authenticate as Bob (Different Candidate)
    const bobAuth = await auth.api.signInEmail({
      body: {
        email: "bob@candidate.dev",
        password: "Password123!",
      },
    });
    const bobToken = bobAuth.token;
    console.log("✅ 13. Authenticated as Candidate Bob:", bobAuth.user.email);

    // 14. Option B Identity Security Gate: Bob attempts to use Alice's invitation token
    const mismatchRes = await fetch(
      `${baseUrl}/api/v1/invitations/verify/alice-frontend-fundamentals-token-demo`,
      {
        headers: {
          authorization: `Bearer ${bobToken}`,
        },
      }
    );
    const mismatchJson = (await mismatchRes.json()) as any;
    console.log(
      `✅ 14. GET /invitations/verify/:token (mismatched candidate email) status: ${mismatchRes.status} (expect 403 Forbidden)`
    );
    if (mismatchRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for mismatched candidate identity, got ${mismatchRes.status}: ${JSON.stringify(
          mismatchJson
        )}`
      );
    }

    // 15. Verify Non-existent Token (Must return 404 Not Found)
    const notFoundRes = await fetch(
      `${baseUrl}/api/v1/invitations/verify/non-existent-token-00000000`,
      {
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      }
    );
    console.log(
      `✅ 15. GET /invitations/verify/:token (non-existent token) status: ${notFoundRes.status} (expect 404)`
    );
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected 404 for non-existent token, got ${notFoundRes.status}`);
    }

    // 16. Clean up temporary test invitations
    await prisma.candidateInvitation.deleteMany({
      where: {
        assessmentId: activeAssessment.id,
        candidateEmail: {
          in: ["bulk-test-1@example.com", "bulk-test-2@example.com", "single-test@example.com"],
        },
      },
    });
    console.log("✅ 16. Cleaned up temporary test invitations");

    console.log("\n=========================================");
    console.log("🎉 All Candidate Invitations E2E Tests Passed Successfully!");
    console.log("=========================================\n");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runInvitationVerification().catch((err) => {
  console.error("\n❌ Candidate Invitations E2E Verification failed:", err);
  process.exit(1);
});
