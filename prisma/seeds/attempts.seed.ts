import { prisma } from "../../src/lib/prisma.js";
import { AttemptStatus, EvaluationStatus } from "../../src/generated/client/client.js";

export async function seedAttempts() {
  const techcorp = await prisma.organization.findUnique({
    where: { slug: "techcorp" },
  });

  if (!techcorp) {
    throw new Error("TechCorp organization not found. Ensure seedUsers() ran first.");
  }

  // Find candidate users
  const alice = await prisma.user.findUnique({
    where: { email: "alice@candidate.dev" },
  });
  const bob = await prisma.user.findUnique({
    where: { email: "bob@candidate.dev" },
  });

  if (!alice || !bob) {
    throw new Error("Candidate users (alice, bob) not found. Ensure seedUsers() ran first.");
  }

  // Find assessments
  const frontendAssessment = await prisma.assessment.findFirst({
    where: {
      organizationId: techcorp.id,
      title: "Frontend Core Fundamentals",
    },
    include: {
      problems: {
        include: { problem: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  const fullstackAssessment = await prisma.assessment.findFirst({
    where: {
      organizationId: techcorp.id,
      title: "Full Stack Engineering Assessment",
    },
    include: {
      problems: {
        include: { problem: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!frontendAssessment || !fullstackAssessment) {
    throw new Error("Assessments not found. Ensure seedAssessments() ran first.");
  }

  // Find invitations
  const aliceInvite = await prisma.candidateInvitation.findFirst({
    where: {
      assessmentId: frontendAssessment.id,
      candidateEmail: alice.email,
    },
  });

  const bobInvite = await prisma.candidateInvitation.findFirst({
    where: {
      assessmentId: fullstackAssessment.id,
      candidateEmail: bob.email,
    },
  });

  let createdCount = 0;
  let updatedCount = 0;

  // -------------------------------------------------------------
  // 1. Seed Alice's IN_PROGRESS attempt on Frontend Core Fundamentals
  // -------------------------------------------------------------
  const now = new Date();
  const aliceStartedAt = new Date(now.getTime() - 15 * 60 * 1000); // 15 mins ago
  const aliceExpiresAt = new Date(
    aliceStartedAt.getTime() +
      frontendAssessment.durationMinutes * 60 * 1000 +
      60 * 1000
  );

  const existingAliceAttempt = await prisma.assessmentAttempt.findFirst({
    where: {
      assessmentId: frontendAssessment.id,
      candidateId: alice.id,
    },
  });

  let aliceAttemptId: string;

  if (existingAliceAttempt) {
    const updated = await prisma.assessmentAttempt.update({
      where: { id: existingAliceAttempt.id },
      data: {
        status: AttemptStatus.IN_PROGRESS,
        startedAt: aliceStartedAt,
        expiresAt: aliceExpiresAt,
        invitationId: aliceInvite?.id,
      },
    });
    aliceAttemptId = updated.id;
    updatedCount++;
  } else {
    const created = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: frontendAssessment.id,
        invitationId: aliceInvite?.id,
        candidateId: alice.id,
        candidateEmail: alice.email,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: aliceStartedAt,
        expiresAt: aliceExpiresAt,
        evaluationStatus: EvaluationStatus.NOT_REQUIRED,
      },
    });
    aliceAttemptId = created.id;
    createdCount++;
  }

  // Seed Alice's draft answer for the first problem
  const firstProblem = frontendAssessment.problems[0];
  if (firstProblem) {
    const mcqOpts = firstProblem.problem.mcqOptions as any[];
    const firstOptId = mcqOpts && mcqOpts[0] ? mcqOpts[0].id : "opt-seed-1";

    await prisma.submissionAnswer.upsert({
      where: {
        attemptId_problemId: {
          attemptId: aliceAttemptId,
          problemId: firstProblem.problem.id,
        },
      },
      create: {
        attemptId: aliceAttemptId,
        problemId: firstProblem.problem.id,
        selectedOptions: [firstOptId],
      },
      update: {
        selectedOptions: [firstOptId],
      },
    });
  }

  // -------------------------------------------------------------
  // 2. Seed Bob's UNDER_REVIEW attempt on Full Stack Engineering
  // -------------------------------------------------------------
  const bobStartedAt = new Date(now.getTime() - 90 * 60 * 1000); // 90 mins ago
  const bobSubmittedAt = new Date(now.getTime() - 30 * 60 * 1000); // 30 mins ago
  const bobExpiresAt = new Date(
    bobStartedAt.getTime() +
      fullstackAssessment.durationMinutes * 60 * 1000 +
      60 * 1000
  );

  const existingBobAttempt = await prisma.assessmentAttempt.findFirst({
    where: {
      assessmentId: fullstackAssessment.id,
      candidateId: bob.id,
    },
  });

  let bobAttemptId: string;

  if (existingBobAttempt) {
    const updated = await prisma.assessmentAttempt.update({
      where: { id: existingBobAttempt.id },
      data: {
        status: AttemptStatus.UNDER_REVIEW,
        startedAt: bobStartedAt,
        submittedAt: bobSubmittedAt,
        expiresAt: bobExpiresAt,
        autoScore: 15.0,
        manualScore: 0.0,
        totalScore: 15.0,
        percentage: 0.0,
        isPassed: null,
        evaluationStatus: EvaluationStatus.PENDING,
        invitationId: bobInvite?.id,
      },
    });
    bobAttemptId = updated.id;
    updatedCount++;
  } else {
    const created = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: fullstackAssessment.id,
        invitationId: bobInvite?.id,
        candidateId: bob.id,
        candidateEmail: bob.email,
        status: AttemptStatus.UNDER_REVIEW,
        startedAt: bobStartedAt,
        submittedAt: bobSubmittedAt,
        expiresAt: bobExpiresAt,
        autoScore: 15.0,
        manualScore: 0.0,
        totalScore: 15.0,
        percentage: 0.0,
        isPassed: null,
        evaluationStatus: EvaluationStatus.PENDING,
      },
    });
    bobAttemptId = created.id;
    createdCount++;
  }

  // Seed Bob's answers & EvaluationReview
  for (const ap of fullstackAssessment.problems) {
    if (ap.problem.type === "MCQ_SINGLE" || ap.problem.type === "MCQ_MULTIPLE") {
      const opts = ap.problem.mcqOptions as any[];
      const correctOpt = opts?.find((o: any) => o.isCorrect === true);
      const chosenOpt = correctOpt ? correctOpt.id : "opt-1";

      await prisma.submissionAnswer.upsert({
        where: {
          attemptId_problemId: {
            attemptId: bobAttemptId,
            problemId: ap.problem.id,
          },
        },
        create: {
          attemptId: bobAttemptId,
          problemId: ap.problem.id,
          selectedOptions: [chosenOpt],
          autoScore: ap.points,
          isCorrect: true,
        },
        update: {
          selectedOptions: [chosenOpt],
          autoScore: ap.points,
          isCorrect: true,
        },
      });
    } else if (ap.problem.type === "CODING") {
      await prisma.submissionAnswer.upsert({
        where: {
          attemptId_problemId: {
            attemptId: bobAttemptId,
            problemId: ap.problem.id,
          },
        },
        create: {
          attemptId: bobAttemptId,
          problemId: ap.problem.id,
          submittedCode: "function solve(input) {\n  return input.sort();\n}",
          selectedLanguage: "typescript",
        },
        update: {
          submittedCode: "function solve(input) {\n  return input.sort();\n}",
          selectedLanguage: "typescript",
        },
      });
    }
  }

  // Upsert EvaluationReview for Bob's attempt
  await prisma.evaluationReview.upsert({
    where: { attemptId: bobAttemptId },
    create: {
      attemptId: bobAttemptId,
      evaluationStatus: EvaluationStatus.PENDING,
    },
    update: {
      evaluationStatus: EvaluationStatus.PENDING,
    },
  });

  console.log(
    `  📝 Attempts: ${createdCount} created, ${updatedCount} updated (total: ${createdCount + updatedCount}) for TechCorp candidates`
  );

  return {
    totalAttempts: createdCount + updatedCount,
    createdCount,
    updatedCount,
  };
}
