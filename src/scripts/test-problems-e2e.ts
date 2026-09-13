import { createApp } from "../app.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import type { Server } from "node:http";

async function runVerification() {
  console.log("🚀 Starting Problem Bank E2E Verification Test...");
  const app = await createApp();
  const server: Server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 5050;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Healthcheck
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    const healthJson = (await healthRes.json()) as any;
    console.log("✅ 1. Healthcheck status:", healthJson.data?.status);

    // 2. Unauthenticated request to /api/v1/problems (Must fail with 401)
    const unauthRes = await fetch(`${baseUrl}/api/v1/problems`);
    console.log("✅ 2. Unauthenticated GET /problems status (expect 401):", unauthRes.status);
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

    // 3. Authenticate as Recruiter using Better Auth API
    const authResult = await auth.api.signInEmail({
      body: {
        email: "recruiter@techcorp.dev",
        password: "Password123!",
      },
    });
    const bearerToken = authResult.token;
    console.log("✅ 3. Authenticated as Recruiter. User:", authResult.user.email, "Token exists:", !!bearerToken);

    // Find organization ID for techcorp
    const techcorpOrg = await prisma.organization.findUnique({ where: { slug: "techcorp" } });
    if (!techcorpOrg) throw new Error("TechCorp organization not found");
    const orgId = techcorpOrg.id;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
      authorization: `Bearer ${bearerToken}`,
    };

    // 4. List problems (Should return 8 seeded problems)
    const listRes = await fetch(`${baseUrl}/api/v1/problems?limit=10`, {
      headers: requestHeaders,
    });
    const listJson = (await listRes.json()) as any;
    console.log(`✅ 4. GET /problems status: ${listRes.status}, items returned: ${listJson.data?.length}, total: ${listJson.meta?.totalItems}`);
    if (listRes.status !== 200 || !listJson.data || listJson.data.length < 8) {
      throw new Error(`Failed to list seeded problems: ${JSON.stringify(listJson)}`);
    }

    // 5. Test Filtering by Type
    const filterRes = await fetch(`${baseUrl}/api/v1/problems?type=CODING`, {
      headers: requestHeaders,
    });
    const filterJson = (await filterRes.json()) as any;
    console.log(`✅ 5. GET /problems?type=CODING status: ${filterRes.status}, coding problems count: ${filterJson.data?.length}`);
    if (filterJson.data?.length !== 2) {
      throw new Error(`Expected 2 coding problems, got ${filterJson.data?.length}`);
    }

    // 6. Create a new problem (MCQ_SINGLE)
    const createRes = await fetch(`${baseUrl}/api/v1/problems`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        title: "Test Problem for E2E Verification",
        description: "This is a temporary problem created during E2E verification test.",
        type: "MCQ_SINGLE",
        difficulty: "EASY",
        defaultPoints: 10,
        tags: ["e2e", "test"],
        mcqOptions: [
          { text: "Option A (Correct)", isCorrect: true },
          { text: "Option B (Incorrect)", isCorrect: false },
        ],
      }),
    });
    const createJson = (await createRes.json()) as any;
    console.log("✅ 6. POST /problems status:", createRes.status, "Created ID:", createJson.data?.id);
    if (createRes.status !== 201 || !createJson.data?.id) {
      throw new Error(`Failed to create problem: ${JSON.stringify(createJson)}`);
    }
    const createdId = createJson.data.id;

    // 7. Get problem by ID
    const getByIdRes = await fetch(`${baseUrl}/api/v1/problems/${createdId}`, {
      headers: requestHeaders,
    });
    const getByIdJson = (await getByIdRes.json()) as any;
    console.log("✅ 7. GET /problems/:id status:", getByIdRes.status, "Title:", getByIdJson.data?.title);
    if (getByIdRes.status !== 200 || getByIdJson.data?.id !== createdId) {
      throw new Error(`Failed to get problem by ID: ${JSON.stringify(getByIdJson)}`);
    }

    // 8. Update problem
    const updateRes = await fetch(`${baseUrl}/api/v1/problems/${createdId}`, {
      method: "PUT",
      headers: requestHeaders,
      body: JSON.stringify({
        title: "Updated Problem Title E2E",
        difficulty: "MEDIUM",
        defaultPoints: 15,
      }),
    });
    const updateJson = (await updateRes.json()) as any;
    console.log("✅ 8. PUT /problems/:id status:", updateRes.status, "New Title:", updateJson.data?.title);
    if (updateRes.status !== 200 || updateJson.data?.title !== "Updated Problem Title E2E") {
      throw new Error(`Failed to update problem: ${JSON.stringify(updateJson)}`);
    }

    // 9. Delete problem
    const deleteRes = await fetch(`${baseUrl}/api/v1/problems/${createdId}`, {
      method: "DELETE",
      headers: requestHeaders,
    });
    const deleteJson = (await deleteRes.json()) as any;
    console.log("✅ 9. DELETE /problems/:id status:", deleteRes.status, "Deleted:", deleteJson.data?.deleted);
    if (deleteRes.status !== 200 || !deleteJson.data?.deleted) {
      throw new Error(`Failed to delete problem: ${JSON.stringify(deleteJson)}`);
    }

    // 10. Confirm 404 after deletion
    const confirmDeleteRes = await fetch(`${baseUrl}/api/v1/problems/${createdId}`, {
      headers: requestHeaders,
    });
    console.log("✅ 10. GET /problems/:id after deletion (expect 404):", confirmDeleteRes.status);
    if (confirmDeleteRes.status !== 404) {
      throw new Error(`Expected 404 after deletion, got ${confirmDeleteRes.status}`);
    }

    // 11. Test 422 Validation Error (MCQ_SINGLE with 0 correct options)
    const invalidMcqRes = await fetch(`${baseUrl}/api/v1/problems`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        title: "Invalid MCQ with no correct options",
        description: "This should be rejected by Zod superRefine with 422.",
        type: "MCQ_SINGLE",
        mcqOptions: [
          { text: "Opt 1", isCorrect: false },
          { text: "Opt 2", isCorrect: false },
        ],
      }),
    });
    console.log("✅ 11. POST /problems invalid payload (expect 422):", invalidMcqRes.status);
    if (invalidMcqRes.status !== 422) {
      throw new Error(`Expected 422 for invalid MCQ, got ${invalidMcqRes.status}`);
    }

    // 12. Test 400 Bad Request (Missing x-organization-id header)
    const missingOrgRes = await fetch(`${baseUrl}/api/v1/problems`, {
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
    });
    console.log("✅ 12. GET /problems without org header (expect 400):", missingOrgRes.status);
    if (missingOrgRes.status !== 400) {
      throw new Error(`Expected 400 for missing org header, got ${missingOrgRes.status}`);
    }

    console.log("\n🎉 ALL 12 E2E VERIFICATION CHECKS PASSED PERFECTLY!\n");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    server.close();
    await prisma.$disconnect();
    throw error;
  }
}

runVerification().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
