import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { insertGapSchema, type InsertGap } from "@shared/schema";

/**
 * Typed adapter for the gap form's `zodResolver`. Zod v4 + RHF v7.72 +
 * `@hookform/resolvers` v5.2.2 produce a resolver whose generics
 * (`Resolver<Input, Context, Output>`) cannot be unified with
 * `Resolver<InsertGap>` even though the runtime values line up exactly.
 * This helper isolates the single re-assertion so callers (the gap
 * analysis dialog) can wire the resolver up without their own escape
 * hatch. Mirrors `projectFormResolver` in `../project-form/types.ts`.
 */
export const gapFormResolver: Resolver<InsertGap> =
  zodResolver(insertGapSchema) as unknown as Resolver<InsertGap>;
