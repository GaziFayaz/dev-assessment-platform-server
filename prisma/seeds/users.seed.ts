import crypto from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../../src/lib/prisma.js";

interface SeedUserParams {
  email: string;
  name: string;
  role?: string;
  password?: string;
  emailVerified?: boolean;
}

const DEFAULT_PASSWORD = "Password123!";

/**
 * Idempotently upserts a User and links a credential Account with a hashed password
 */
async function upsertUserWithCredential({
  email,
  name,
  role = "user",
  password = DEFAULT_PASSWORD,
  emailVerified = true,
}: SeedUserParams) {
  const normalizedEmail = email.toLowerCase();
  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name,
      role,
      emailVerified,
    },
    create: {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name,
      role,
      emailVerified,
    },
  });

  const existingAccount = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: "credential",
    },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        password: hashedPassword,
        accountId: user.id,
      },
    });
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hashedPassword,
      },
    });
  }

  return user;
}

/**
 * Idempotently ensures an organization membership
 */
async function ensureMembership(organizationId: string, userId: string, role: string) {
  const existingMember = await prisma.member.findFirst({
    where: {
      organizationId,
      userId,
    },
  });

  if (existingMember) {
    return prisma.member.update({
      where: { id: existingMember.id },
      data: { role },
    });
  }

  return prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId,
      userId,
      role,
      createdAt: new Date(),
    },
  });
}

/**
 * Seed all standard personas: Platform Admin, Company Admin, Recruiter, Candidates, and Demo Organization
 */
export async function seedUsers() {
  // 1. Platform Administrator
  const platformAdmin = await upsertUserWithCredential({
    email: "admin@platform.dev",
    name: "Platform Admin",
    role: "admin", // PLATFORM_ADMIN tier
  });
  console.log(`  👤 Platform Admin: ${platformAdmin.email} (role: admin)`);

  // 2. Demo Organization (TechCorp Solutions)
  const techcorpOrg = await prisma.organization.upsert({
    where: { slug: "techcorp" },
    update: {
      name: "TechCorp Solutions",
    },
    create: {
      id: crypto.randomUUID(),
      name: "TechCorp Solutions",
      slug: "techcorp",
      createdAt: new Date(),
    },
  });
  console.log(`  🏢 Organization: ${techcorpOrg.name} (slug: ${techcorpOrg.slug}, id: ${techcorpOrg.id})`);

  // 3. Company Administrator (TechCorp)
  const companyAdmin = await upsertUserWithCredential({
    email: "admin@techcorp.dev",
    name: "Sarah Connor (Company Admin)",
    role: "user",
  });
  await ensureMembership(techcorpOrg.id, companyAdmin.id, "admin");
  console.log(`  👤 Company Admin: ${companyAdmin.email} (TechCorp member role: admin)`);

  // 4. Recruiter (TechCorp)
  const recruiter = await upsertUserWithCredential({
    email: "recruiter@techcorp.dev",
    name: "Alex Rivera (Recruiter)",
    role: "user",
  });
  await ensureMembership(techcorpOrg.id, recruiter.id, "recruiter");
  console.log(`  👤 Recruiter: ${recruiter.email} (TechCorp member role: recruiter)`);

  // 5. Candidates
  const candidateAlice = await upsertUserWithCredential({
    email: "alice@candidate.dev",
    name: "Alice Chen (Candidate)",
    role: "user",
  });
  console.log(`  🎓 Candidate: ${candidateAlice.email}`);

  const candidateBob = await upsertUserWithCredential({
    email: "bob@candidate.dev",
    name: "Bob Miller (Candidate)",
    role: "user",
  });
  console.log(`  🎓 Candidate: ${candidateBob.email}`);

  return {
    usersCount: 5,
    orgsCount: 1,
    organization: techcorpOrg,
    users: {
      platformAdmin,
      companyAdmin,
      recruiter,
      candidateAlice,
      candidateBob,
    },
    defaultPassword: DEFAULT_PASSWORD,
  };
}
