import crypto from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";
import { seedUsers } from "./users.seed.js";
import { AssessmentStatus } from "../../src/generated/client/client.js";

type UserSummary = Awaited<ReturnType<typeof seedUsers>>;

interface SeedAssessmentConfig {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  passingScore: number;
  status: AssessmentStatus;
  creatorKey: "recruiter" | "companyAdmin";
  problemTitles: Array<{ title: string; points: number; orderIndex: number }>;
}

const DEMO_ASSESSMENTS: SeedAssessmentConfig[] = [
  // 1. Full Stack Assessment (PUBLISHED)
  {
    title: "Full Stack Engineering Assessment",
    description: "Evaluates modern full-stack competencies including JS concurrency, network protocols, systems design, and data structures.",
    instructions: "Complete all sections within 60 minutes. Your coding solution and written design will be reviewed against our technical rubrics.",
    durationMinutes: 60,
    passingScore: 70.0,
    status: "PUBLISHED",
    creatorKey: "recruiter",
    problemTitles: [
      { title: "JavaScript Event Loop Execution Order", points: 15.0, orderIndex: 1 },
      { title: "HTTP Idempotency in RESTful APIs", points: 15.0, orderIndex: 2 },
      { title: "Distributed Caching: Patterns & Cache Invalidation", points: 30.0, orderIndex: 3 },
      { title: "Design and Implement an LRU Cache", points: 40.0, orderIndex: 4 },
    ],
  },
  // 2. Frontend Fundamentals Quiz (ACTIVE)
  {
    title: "Frontend Core Fundamentals",
    description: "Automated assessment testing fundamental web concepts, protocol standards, and browser runtime mechanics.",
    instructions: "30-minute multiple choice test. Results are automatically computed upon submission.",
    durationMinutes: 30,
    passingScore: 20.0,
    status: "ACTIVE",
    creatorKey: "companyAdmin",
    problemTitles: [
      { title: "JavaScript Event Loop Execution Order", points: 10.0, orderIndex: 1 },
      { title: "HTTP Idempotency in RESTful APIs", points: 10.0, orderIndex: 2 },
      { title: "React Hooks Rules and Guarantees", points: 10.0, orderIndex: 3 },
    ],
  },
  // 3. Backend Architecture Challenge (DRAFT)
  {
    title: "Backend Architecture Challenge",
    description: "In-depth engineering evaluation focusing on distributed cache architectures and algorithmic efficiency.",
    instructions: "Work in progress draft assessment for senior backend engineering applicants.",
    durationMinutes: 90,
    passingScore: 50.0,
    status: "DRAFT",
    creatorKey: "recruiter",
    problemTitles: [
      { title: "Distributed Caching: Patterns & Cache Invalidation", points: 30.0, orderIndex: 1 },
      { title: "Two Sum II - Input Array Is Sorted", points: 30.0, orderIndex: 2 },
    ],
  },
];

export async function seedAssessments(userSummary: UserSummary) {
  const organizationId = userSummary.organization.id;
  let createdCount = 0;
  let updatedCount = 0;

  // Pre-load all organization problems into a title map for quick lookup
  const problems = await prisma.problem.findMany({
    where: { organizationId },
  });
  const problemMap = new Map(problems.map((p) => [p.title, p]));

  for (const config of DEMO_ASSESSMENTS) {
    const creatorId = userSummary.users[config.creatorKey].id;

    // Check if assessment already exists
    let assessment = await prisma.assessment.findFirst({
      where: {
        organizationId,
        title: config.title,
      },
    });

    if (assessment) {
      assessment = await prisma.assessment.update({
        where: { id: assessment.id },
        data: {
          description: config.description,
          instructions: config.instructions,
          durationMinutes: config.durationMinutes,
          passingScore: config.passingScore,
          status: config.status,
          creatorId,
        },
      });
      updatedCount++;
    } else {
      assessment = await prisma.assessment.create({
        data: {
          id: crypto.randomUUID(),
          organizationId,
          creatorId,
          title: config.title,
          description: config.description,
          instructions: config.instructions,
          durationMinutes: config.durationMinutes,
          passingScore: config.passingScore,
          totalScore: 0.0,
          status: config.status,
        },
      });
      createdCount++;
    }

    // Attach problems
    let calculatedTotal = 0;
    for (const probConfig of config.problemTitles) {
      const problem = problemMap.get(probConfig.title);
      if (!problem) {
        console.warn(`    ⚠️ Warning: Seed problem "${probConfig.title}" not found for assessment "${config.title}"`);
        continue;
      }

      await prisma.assessmentProblem.upsert({
        where: {
          assessmentId_problemId: {
            assessmentId: assessment.id,
            problemId: problem.id,
          },
        },
        update: {
          points: probConfig.points,
          orderIndex: probConfig.orderIndex,
        },
        create: {
          id: crypto.randomUUID(),
          assessmentId: assessment.id,
          problemId: problem.id,
          points: probConfig.points,
          orderIndex: probConfig.orderIndex,
        },
      });

      calculatedTotal += probConfig.points;
    }

    // Update totalScore on assessment
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { totalScore: calculatedTotal },
    });
  }

  console.log(
    `  📋 Assessments: ${createdCount} created, ${updatedCount} updated (total: ${DEMO_ASSESSMENTS.length}) for Org: ${userSummary.organization.name}`
  );

  return {
    totalAssessments: DEMO_ASSESSMENTS.length,
    createdCount,
    updatedCount,
  };
}
