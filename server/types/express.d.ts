import "express";
import "passport";

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      profileImageUrl?: string | null;
      role?: string | null;
      isApproved?: boolean | null;
      mfaEnabled?: boolean | null;
      mfaMethod?: string | null;
      mfaEnrolledAt?: Date | null;
      claims?: Record<string, unknown>;
      [key: string]: unknown;
    }
  }
}

export {};
