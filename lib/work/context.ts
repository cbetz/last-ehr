import { z } from "zod";

const safeText = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));

/** Shared data contract only: importing it starts no model, store, or transport. */
export const workContextSchema = z.object({
  patient: z.object({
    reference: z.string().regex(/^Patient\/[A-Za-z0-9\-.]{1,64}$/),
    label: safeText(160),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  observation: z.object({
    reference: z.string().regex(/^Observation\/[A-Za-z0-9\-.]{1,64}$/),
    versionId: z.string().regex(/^[A-Za-z0-9\-.]{1,64}$/),
    label: safeText(160), value: z.number().finite(), unit: safeText(80),
    effectiveDateTime: z.string().datetime({ offset: true }),
  }).strict(),
}).strict();

export type WorkAssistantContext = z.infer<typeof workContextSchema>;
