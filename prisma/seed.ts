import { prisma } from "../src/lib/prisma.js";
import { seedUsers } from "./seeds/users.seed.js";
import { seedProblems } from "./seeds/problems.seed.js";

async function main() {
  console.log("🌱 =========================================");
  console.log("🌱 Starting Database Seed Pipeline...");
  console.log("🌱 =========================================");
  const startTime = Date.now();

  try {
    // 1. Core Users, Roles, and Organizations
    console.log("\n📦 [1/2] Seeding Users, Personas & Organizations...");
    const userSummary = await seedUsers();
    console.log(`✨ Successfully seeded ${userSummary.usersCount} users and ${userSummary.orgsCount} organization(s).`);

    // 2. Problem Bank
    console.log("\n📦 [2/2] Seeding Problem Bank Questions...");
    const problemSummary = await seedProblems(userSummary);
    console.log(`✨ Successfully seeded ${problemSummary.totalProblems} problem(s).`);

    // Modular Feature Seeders Hook:
    // Future feature modules will plug their seeders in here:
    // 3. await seedAssessments(userSummary);
    // 4. await seedInvitations(userSummary);
    // 5. await seedAttempts(userSummary);
    // 6. await seedEvaluations(userSummary);

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
