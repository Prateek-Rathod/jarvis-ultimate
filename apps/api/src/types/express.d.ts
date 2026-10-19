import type { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: Pick<User, "id" | "email" | "displayName" | "timezone">;
        sessionId: string;
        csrfToken: string;
      };
      requestId?: string;
    }
  }
}

export {};
