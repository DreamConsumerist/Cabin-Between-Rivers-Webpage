import { z } from "zod";

export const loginSchema = z.object({
	password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Rates are entered in dollars in the UI and converted to cents before
// hitting the API (the server, like the rest of the app, stores money in
// integer cents — see db/schema.ts).
export const settingsFormSchema = z.object({
	nightlyRate: z.coerce.number().min(0, "Must be 0 or more"),
	cleaningFee: z.coerce.number().min(0, "Must be 0 or more"),
	minNights: z.coerce.number().int().min(1, "Must be at least 1"),
	airbnbIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
	vrboIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
});

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.output<typeof settingsFormSchema>;

export const termsFormSchema = z.object({
	termsContent: z.string().trim().min(1, "Terms content is required"),
});

export type TermsFormValues = z.infer<typeof termsFormSchema>;
