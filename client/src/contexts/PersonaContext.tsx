import React, { createContext, useContext, useCallback, useEffect, useMemo } from "react";
import { useAuth, type ViewAsInfo } from "@/hooks/useAuth";

// View As (the Dev Persona Switcher). The server decides who the session is
// (server/auth/view-as.ts): while View As is on, /api/auth/user returns the
// person being viewed plus a `viewAs` block, and every page, query and
// permission check already answers as them. This context only reads that
// state and starts or ends View As. Starting and ending reload the page so
// nothing cached as the previous person stays on screen.

export interface PersonaState {
  isActive: boolean;
  /** "Name (Role)" in user mode, the role in role mode. */
  personaLabel: string;
  effectiveRole: string | null;
  personaUserId: string | null;
  realUser: ViewAsInfo["realUser"] | null;
}

interface PersonaContextValue extends PersonaState {
  activatePersonaRole: (role: string) => Promise<void>;
  activatePersonaUser: (userId: string) => Promise<void>;
  exitPersona: () => Promise<void>;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

let _personaActive = false;

/** For non-component code (apiRequest, page-view tracking). */
export function getPersonaActive(): boolean {
  return _personaActive;
}

async function sendViewAs(method: "POST" | "DELETE", body?: { userId: string } | { role: string }): Promise<void> {
  // Plain fetch: apiRequest refuses writes while View As is on, and these
  // are the two writes the server allows then. The CSRF interceptor adds
  // the token header.
  const response = await fetch("/api/view-as", {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  window.location.reload();
}

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const viewAs = user?.viewAs ?? null;

  const state = useMemo<PersonaState>(() => {
    if (!user || !viewAs) {
      return { isActive: false, personaLabel: "", effectiveRole: null, personaUserId: null, realUser: null };
    }
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    return {
      isActive: true,
      personaLabel: viewAs.mode === "user" ? `${name} (${viewAs.role})` : (user.firstName || viewAs.role),
      effectiveRole: viewAs.role,
      personaUserId: viewAs.targetUserId,
      realUser: viewAs.realUser,
    };
  }, [user, viewAs]);

  useEffect(() => {
    _personaActive = state.isActive;
  }, [state.isActive]);

  const activatePersonaRole = useCallback((role: string) => sendViewAs("POST", { role }), []);
  const activatePersonaUser = useCallback((userId: string) => sendViewAs("POST", { userId }), []);
  const exitPersona = useCallback(() => sendViewAs("DELETE"), []);

  return (
    <PersonaContext.Provider value={{ ...state, activatePersonaRole, activatePersonaUser, exitPersona }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) {
    return {
      isActive: false,
      personaLabel: "",
      effectiveRole: null,
      personaUserId: null,
      realUser: null,
      activatePersonaRole: async () => {},
      activatePersonaUser: async () => {},
      exitPersona: async () => {},
    };
  }
  return ctx;
}
