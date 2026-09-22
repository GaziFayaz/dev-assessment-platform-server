import { prisma } from "../../lib/prisma.js";
import {
  Prisma,
  CandidateInvitation,
  Assessment,
  AssessmentAttempt,
} from "../../generated/client/client.js";

export interface FindInvitationsParams {
  assessmentId: string;
  search?: string;
  skip?: number;
  take?: number;
}

export type CandidateInvitationWithAttempts = CandidateInvitation & {
  attempts: Array<
    Pick<
      AssessmentAttempt,
      "id" | "status" | "startedAt" | "submittedAt" | "totalScore" | "isPassed"
    >
  >;
};

export type CandidateInvitationWithAssessment = CandidateInvitation & {
  assessment: Assessment & {
    organization: {
      id: string;
      name: string;
      slug: string;
      logo: string | null;
    };
  };
  attempts: Array<
    Pick<
      AssessmentAttempt,
      "id" | "status" | "startedAt" | "expiresAt" | "totalScore" | "isPassed"
    >
  >;
};

export class InvitationRepository {
  /**
   * Find an assessment by ID and organization ID (tenant verification)
   */
  async findAssessmentByIdAndOrg(
    assessmentId: string,
    organizationId: string
  ): Promise<Assessment | null> {
    return prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
      },
    });
  }

  /**
   * Find an existing invitation for an assessment and candidate email
   */
  async findExistingInvitation(
    assessmentId: string,
    candidateEmail: string
  ): Promise<(CandidateInvitation & { attempts: AssessmentAttempt[] }) | null> {
    return prisma.candidateInvitation.findFirst({
      where: {
        assessmentId,
        candidateEmail: {
          equals: candidateEmail,
          mode: "insensitive",
        },
      },
      include: {
        attempts: true,
      },
    });
  }

  /**
   * Create a single candidate invitation
   */
  async createInvitation(
    data: Prisma.CandidateInvitationCreateInput
  ): Promise<CandidateInvitationWithAttempts> {
    return prisma.candidateInvitation.create({
      data,
      include: {
        attempts: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            submittedAt: true,
            totalScore: true,
            isPassed: true,
          },
        },
      },
    });
  }

  /**
   * Update an existing invitation (e.g. renewal/extension)
   */
  async updateInvitation(
    id: string,
    data: Prisma.CandidateInvitationUpdateInput
  ): Promise<CandidateInvitationWithAttempts> {
    return prisma.candidateInvitation.update({
      where: { id },
      data,
      include: {
        attempts: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            submittedAt: true,
            totalScore: true,
            isPassed: true,
          },
        },
      },
    });
  }

  /**
   * Find paginated invitations for an assessment
   */
  async findManyByAssessment(
    params: FindInvitationsParams
  ): Promise<CandidateInvitationWithAttempts[]> {
    const { assessmentId, search, skip = 0, take = 20 } = params;

    const where: Prisma.CandidateInvitationWhereInput = {
      assessmentId,
      ...(search && {
        OR: [
          { candidateEmail: { contains: search, mode: "insensitive" } },
          { candidateName: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    return prisma.candidateInvitation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        attempts: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            submittedAt: true,
            totalScore: true,
            isPassed: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  /**
   * Count total invitations matching search filters
   */
  async countByAssessment(params: {
    assessmentId: string;
    search?: string;
  }): Promise<number> {
    const { assessmentId, search } = params;

    const where: Prisma.CandidateInvitationWhereInput = {
      assessmentId,
      ...(search && {
        OR: [
          { candidateEmail: { contains: search, mode: "insensitive" } },
          { candidateName: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    return prisma.candidateInvitation.count({ where });
  }

  /**
   * Find an invitation by its unique token, with assessment & org metadata
   */
  async findByToken(
    token: string
  ): Promise<CandidateInvitationWithAssessment | null> {
    return prisma.candidateInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        assessment: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
              },
            },
          },
        },
        attempts: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            expiresAt: true,
            totalScore: true,
            isPassed: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }
}

export const invitationRepository = new InvitationRepository();
