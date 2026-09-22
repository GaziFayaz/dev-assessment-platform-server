import crypto from "crypto";
import { AppError } from "../../errors/app-error.js";
import {
  InvitationRepository,
  invitationRepository,
  CandidateInvitationWithAttempts,
  CandidateInvitationWithAssessment,
} from "./invitation.repository.js";
import {
  SendInvitationsInput,
  InvitationQueryParams,
  InvitationItemResponse,
  InvitationStatus,
} from "./invitation.schema.js";

export class InvitationService {
  constructor(
    private readonly repository: InvitationRepository = invitationRepository
  ) {}

  /**
   * Helper: Resolves dynamic lifecycle status of an invitation
   */
  private resolveStatus(
    invitation: CandidateInvitationWithAttempts | CandidateInvitationWithAssessment
  ): InvitationStatus {
    if (invitation.attempts && invitation.attempts.length > 0) {
      const latestAttempt = invitation.attempts[0];
      if (latestAttempt.status === "COMPLETED") {
        return "COMPLETED";
      }
      if (
        ["IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"].includes(
          latestAttempt.status
        )
      ) {
        return "STARTED";
      }
    }

    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      return "EXPIRED";
    }

    return "INVITED";
  }

  /**
   * Helper: Formats an invitation database record into an API response item
   */
  private formatInvitationItem(
    invitation: CandidateInvitationWithAttempts
  ): InvitationItemResponse {
    const status = this.resolveStatus(invitation);
    const latestAttempt =
      invitation.attempts && invitation.attempts.length > 0
        ? invitation.attempts[0]
        : null;

    return {
      id: invitation.id,
      assessmentId: invitation.assessmentId,
      candidateEmail: invitation.candidateEmail,
      candidateName: invitation.candidateName,
      inviteToken: invitation.inviteToken,
      expiresAt: invitation.expiresAt.toISOString(),
      isAccepted: invitation.isAccepted,
      status,
      createdAt: invitation.createdAt.toISOString(),
      attempt: latestAttempt
        ? {
            id: latestAttempt.id,
            status: latestAttempt.status,
            startedAt: latestAttempt.startedAt?.toISOString() || null,
            submittedAt: latestAttempt.submittedAt?.toISOString() || null,
            totalScore: latestAttempt.totalScore,
            isPassed: latestAttempt.isPassed,
          }
        : null,
    };
  }

  /**
   * Send single or bulk candidate invitations for an assessment
   */
  async sendInvitations(
    assessmentId: string,
    input: SendInvitationsInput,
    organizationId: string
  ): Promise<{ sentCount: number; invitations: InvitationItemResponse[] }> {
    // 1. Verify assessment exists and belongs to the active tenant
    const assessment = await this.repository.findAssessmentByIdAndOrg(
      assessmentId,
      organizationId
    );

    if (!assessment) {
      throw AppError.notFound("Assessment not found in your organization");
    }

    // 2. Enforce assessment lifecycle rule: Only PUBLISHED or ACTIVE assessments accept invites
    if (assessment.status !== "PUBLISHED" && assessment.status !== "ACTIVE") {
      throw AppError.conflict(
        `Cannot send invitations: Assessment status is '${assessment.status}'. Invitations can only be dispatched for PUBLISHED or ACTIVE assessments.`
      );
    }

    const defaultDays = input.defaultExpiresInDays || 7;
    const results: InvitationItemResponse[] = [];

    // 3. Process each invitation
    for (const inviteItem of input.invitations) {
      const email = inviteItem.candidateEmail.toLowerCase().trim();
      const name = inviteItem.candidateName?.trim() || null;

      // Determine expiration timestamp
      let calculatedExpiresAt: Date;
      if (inviteItem.expiresAt) {
        calculatedExpiresAt = new Date(inviteItem.expiresAt);
      } else {
        calculatedExpiresAt = new Date(
          Date.now() + defaultDays * 24 * 60 * 60 * 1000
        );
      }

      // Bound expiresAt to assessment.validUntil if assessment has an expiration window
      if (
        assessment.validUntil &&
        calculatedExpiresAt.getTime() > new Date(assessment.validUntil).getTime()
      ) {
        calculatedExpiresAt = new Date(assessment.validUntil);
      }

      // Check if an invitation already exists for this candidate
      const existing = await this.repository.findExistingInvitation(
        assessmentId,
        email
      );

      if (existing) {
        // If an attempt has already been made, prevent re-invitation to preserve integrity
        const hasStartedAttempt = existing.attempts.some((att) =>
          ["IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "COMPLETED"].includes(
            att.status
          )
        );

        if (hasStartedAttempt) {
          throw AppError.conflict(
            `Candidate '${email}' has already started or completed an assessment attempt.`
          );
        }

        // Renew invitation with a fresh token and updated expiration date
        const freshToken = crypto.randomUUID();
        const updated = await this.repository.updateInvitation(existing.id, {
          inviteToken: freshToken,
          expiresAt: calculatedExpiresAt,
          candidateName: name || existing.candidateName,
          isAccepted: false,
        });

        results.push(this.formatInvitationItem(updated));
      } else {
        // Create new invitation with cryptographically secure token
        const newToken = crypto.randomUUID();
        const created = await this.repository.createInvitation({
          assessment: { connect: { id: assessmentId } },
          candidateEmail: email,
          candidateName: name,
          inviteToken: newToken,
          expiresAt: calculatedExpiresAt,
        });

        results.push(this.formatInvitationItem(created));
      }
    }

    return {
      sentCount: results.length,
      invitations: results,
    };
  }

  /**
   * List sent invitations for an assessment with pagination and status filtering
   */
  async getInvitations(
    assessmentId: string,
    query: InvitationQueryParams,
    organizationId: string
  ): Promise<{
    items: InvitationItemResponse[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    // 1. Verify assessment exists and belongs to tenant
    const assessment = await this.repository.findAssessmentByIdAndOrg(
      assessmentId,
      organizationId
    );

    if (!assessment) {
      throw AppError.notFound("Assessment not found in your organization");
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // Fetch database items matching search
    const invitations = await this.repository.findManyByAssessment({
      assessmentId,
      search: query.search,
      skip: query.status ? 0 : skip, // If filtering by computed status, fetch all to paginate in memory
      take: query.status ? 1000 : limit,
    });

    let formattedItems = invitations.map((inv) => this.formatInvitationItem(inv));

    // Filter by computed status if requested
    if (query.status) {
      formattedItems = formattedItems.filter(
        (item) => item.status === query.status
      );
      const totalItems = formattedItems.length;
      const paginatedItems = formattedItems.slice(skip, skip + limit);

      return {
        items: paginatedItems,
        meta: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    }

    const totalItems = await this.repository.countByAssessment({
      assessmentId,
      search: query.search,
    });

    return {
      items: formattedItems,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * Candidate Token Verification (Option B Security Gate)
   * Enforces that authenticated user email strictly matches invitation recipient.
   */
  async verifyInvitationToken(
    token: string,
    currentUser: { id: string; email: string }
  ) {
    // 1. Lookup invitation by token
    const invitation = await this.repository.findByToken(token);

    if (!invitation) {
      throw AppError.notFound("Invalid or non-existent invitation token");
    }

    // 2. Strict Option B Identity Check: Email Match
    const inviteEmail = invitation.candidateEmail.toLowerCase().trim();
    const userEmail = currentUser.email.toLowerCase().trim();

    if (inviteEmail !== userEmail) {
      throw AppError.forbidden(
        `Forbidden: Authenticated account email (${currentUser.email}) does not match invitation recipient (${invitation.candidateEmail}). Please sign in with the invited email address.`
      );
    }

    // 3. Expiration Check
    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      throw new AppError(
        410,
        "Invitation token has expired. Please contact the recruiter to request a renewed invitation.",
        "INVITATION_EXPIRED"
      );
    }

    // 4. Assessment Status Check
    const assessment = invitation.assessment;
    if (assessment.status === "CLOSED" || assessment.status === "ARCHIVED") {
      throw AppError.conflict(
        `Assessment is no longer active (status: ${assessment.status}). Candidate attempts are closed.`
      );
    }

    // 5. Existing Attempt Lifecycle Check
    const latestAttempt =
      invitation.attempts && invitation.attempts.length > 0
        ? invitation.attempts[0]
        : null;

    if (latestAttempt && latestAttempt.status === "COMPLETED") {
      throw AppError.conflict(
        "You have already completed this assessment. No additional attempts are permitted."
      );
    }

    return {
      canStart: true,
      invitation: {
        id: invitation.id,
        candidateEmail: invitation.candidateEmail,
        candidateName: invitation.candidateName,
        expiresAt: invitation.expiresAt.toISOString(),
        isAccepted: invitation.isAccepted,
      },
      assessment: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        instructions: assessment.instructions,
        durationMinutes: assessment.durationMinutes,
        totalScore: assessment.totalScore,
        passingScore: assessment.passingScore,
        status: assessment.status,
        validFrom: assessment.validFrom?.toISOString() || null,
        validUntil: assessment.validUntil?.toISOString() || null,
      },
      organization: {
        id: assessment.organization.id,
        name: assessment.organization.name,
        slug: assessment.organization.slug,
        logo: assessment.organization.logo,
      },
      existingAttempt: latestAttempt
        ? {
            id: latestAttempt.id,
            status: latestAttempt.status,
            startedAt: latestAttempt.startedAt?.toISOString() || null,
            expiresAt: latestAttempt.expiresAt?.toISOString() || null,
          }
        : null,
    };
  }
}

export const invitationService = new InvitationService();
