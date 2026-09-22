import { prisma } from "../src/lib/prisma.js";
import { seedUsers } from "./seeds/users.seed.js";
import { seedProblems } from "./seeds/problems.seed.js";
import { seedAssessments } from "./seeds/assessments.seed.js";
import { seedInvitations } from "./seeds/invitations.seed.js";
import { seedAttempts } from "./seeds/attempts.seed.js";

async function main() {
  console.log("🌱 =========================================");
  console.log("🌱 Starting Database Seed Pipeline...");
  console.log("🌱 =========================================");
  const startTime = Date.now();

  try {
    // 1. Core Users, Roles, and Organizations
    console.log("\n📦 [1/4] Seeding Users, Personas & Organizations...");
    const userSummary = await seedUsers();
    console.log(`✨ Successfully seeded ${userSummary.usersCount} users and ${userSummary.orgsCount} organization(s).`);

    // 2. Problem Bank
    console.log("\n📦 [2/4] Seeding Problem Bank Questions...");
    const problemSummary = await seedProblems(userSummary);
    console.log(`✨ Successfully seeded ${problemSummary.totalProblems} problem(s).`);

    // 3. Assessment Builder
    console.log("\n📦 [3/4] Seeding Assessments & Problem Assemblies...");
    const assessmentSummary = await seedAssessments(userSummary);
    console.log(`✨ Successfully seeded ${assessmentSummary.totalAssessments} assessment(s).`);

    // 4. Candidate Invitations
    console.log("\n📦 [4/4] Seeding Candidate Assessment Invitations...");
    const invitationSummary = await seedInvitations(userSummary);
    console.log(`✨ Successfully seeded ${invitationSummary.totalInvitations} invitation(s).`);

    // 5. Candidate Attempts & Evaluations
    console.log("\n📦 [5/5] Seeding Candidate Attempts & Review Queue...");
    const attemptSummary = await seedAttempts();
    console.log(`✨ Successfully seeded ${attemptSummary.totalAttempts} candidate attempt(s).`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n=========================================");
    console.log(`🎉 Database seeding completed successfully in ${duration}s!`);
    console.log("=========================================\n");
    console.log("🔑 Default Test Credentials:");
    console.log(`   Password for all accounts: ${userSummary.defaultPassword}`);
    console.log("   • Platform Admin : admin@platform.dev");
    console.log("   • Company Admin  : admin@techcorp.dev  (Org: TechCorp Solutions)");
    console.log("   • Recruiter      : recruiter@techcorp.dev (Org: TechCorp Solutions)");
    console.log("   • Candidates     : alice@candidate.dev, bob@candidate.dev");
    console.log("=========================================\n");
  } catch (error) {
    console.error("\n❌ Database seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
