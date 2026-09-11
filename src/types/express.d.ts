import { Member, User, Session } from "../generated/client/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: User & Record<string, any>;
      session?: Session & Record<string, any>;
      organizationId?: string;
      companyMember?: Member;
    }
  }
}

export {};
