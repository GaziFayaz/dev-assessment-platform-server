import { prisma } from "../../src/lib/prisma.js";
import { seedUsers } from "./users.seed.js";

type UserSummary = Awaited<ReturnType<typeof seedUsers>>;

export interface SeedInvitationConfig {
  assessmentTitle: string;
  candidateEmail: string;
  candidateName: string;
  inviteToken: string;
  expiresInDays: number;
}

const DEMO_INVITATIONS: SeedInvitationConfig[] = [
  // 1. Alice invited to the ACTIVE Frontend assessment
  {
    assessmentTitle: "Frontend Core Fundamentals",
    candidateEmail: "alice@candidate.dev",
    candidateName: "Alice Candidate",
    inviteToken: "alice-frontend-fundamentals-token-demo",
    expiresInDays: 7,
  },
  // 2. Bob invited to the PUBLISHED Full Stack assessment
  {
    assessmentTitle: "Full Stack Engineering Assessment",
    candidateEmail: "bob@candidate.dev",
    candidateName: "Bob Candidate",
    inviteToken: "bob-fullstack-assessment-token-demo",
    expiresInDays: 7,
  },
];

export async function seedInvitations(userSummary?: UserSummary) {
  // Find TechCorp organization
  const techcorp = await prisma.organization.findUnique({
    where: { slug: "techcorp" },
  });

  if (!techcorp) {
    throw new Error("TechCorp organization not found. Ensure seedUsers() ran first.");
  }

  let createdCount = 0;
  let updatedCount = 0;
  const createdInvitations: Array<{ id: string; email: string; token: string }> = [];

  for (const item of DEMO_INVITATIONS) {
    const assessment = await prisma.assessment.findFirst({
      where: {
        organizationId: techcorp.id,
        title: item.assessmentTitle,
      },
    });

    if (!assessment) {
      console.warn(
        `⚠️ Assessment '${item.assessmentTitle}' not found. Skipping invitation for ${item.candidateEmail}.`
      );
      continue;
    }

    const expiresAt = new Date(Date.now() + item.expiresInDays * 24 * 60 * 60 * 1000);

    let existing = await prisma.candidateInvitation.findUnique({
      where: {
        inviteToken: item.inviteToken,
      },
    });

    if (!existing) {
      existing = await prisma.candidateInvitation.findFirst({
        where: {
          assessmentId: assessment.id,
          candidateEmail: item.candidateEmail,
        },
      });
    }

    if (existing) {
      const updated = await prisma.candidateInvitation.update({
        where: { id: existing.id },
        data: {
          candidateName: item.candidateName,
          inviteToken: item.inviteToken,
          expiresAt,
        },
      });
      updatedCount++;
      createdInvitations.push({
        id: updated.id,
        email: updated.candidateEmail,
        token: updated.inviteToken,
      });
    } else {
      const created = await prisma.candidateInvitation.create({
        data: {
          assessmentId: assessment.id,
          candidateEmail: item.candidateEmail,
          candidateName: item.candidateName,
          inviteToken: item.inviteToken,
          expiresAt,
          isAccepted: false,
        },
      });
      createdCount++;
      createdInvitations.push({
        id: created.id,
        email: created.candidateEmail,
        token: created.inviteToken,
      });
    }
  }

  console.log(
    `  📬 Invitations: ${createdCount} created, ${updatedCount} updated (total: ${createdInvitations.length}) for Org: ${techcorp.name}`
  );

  return {
    totalInvitations: createdInvitations.length,
    invitations: createdInvitations,
  };
}
