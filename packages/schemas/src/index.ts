import { z } from "zod";

import type {
  ApiError,
  RuntimeCapabilitiesResponse,
} from "@vad/types";

export const apiErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    user_message: z.string().min(1),
    retryable: z.boolean(),
    context: z.record(z.string(), z.json()),
    request_id: z.string().min(1),
  })
  .strict();

export const runtimeCapabilitiesResponseSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["ready", "degraded"]),
    requestId: z.string().min(1),
    evaluatedAt: z.iso.datetime({ offset: true }),
    context: z
      .object({
        countryCode: z.string().regex(/^[A-Z]{2}$/),
        activeAssetCodes: z.array(z.string().regex(/^[A-Z0-9]{2,12}$/)),
      })
      .strict(),
    capabilities: z
      .object({
        createPost: z.boolean(),
        submitMarketProposal: z.boolean(),
        viewPortfolio: z.boolean(),
        trade: z.boolean(),
        deposit: z.boolean(),
        withdraw: z.boolean(),
      })
      .strict(),
    reasons: z
      .object({
        createPost: z.string().optional(),
        submitMarketProposal: z.string().optional(),
        viewPortfolio: z.string().optional(),
        trade: z.string().optional(),
        deposit: z.string().optional(),
        withdraw: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export function parseApiError(input: unknown): ApiError | null {
  const result = apiErrorSchema.safeParse(input);
  return result.success ? (result.data as ApiError) : null;
}

export function parseRuntimeCapabilities(
  input: unknown,
): RuntimeCapabilitiesResponse | null {
  const result = runtimeCapabilitiesResponseSchema.safeParse(input);
  return result.success
    ? (result.data as RuntimeCapabilitiesResponse)
    : null;
}
