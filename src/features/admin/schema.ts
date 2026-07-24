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
});

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.output<typeof settingsFormSchema>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const icalFormSchema = z.object({
	airbnbIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
	vrboIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
	// Kept as one comma-separated string (matches settings.notificationEmails
	// and IcalSettings) — parsed into a list server-side, not here.
	notificationEmails: z
		.string()
		.trim()
		.optional()
		.or(z.literal(""))
		.refine(
			(value) => !value || value.split(",").every((part) => EMAIL_REGEX.test(part.trim())),
			"Enter a comma-separated list of valid email addresses"
		),
});

export type IcalFormInput = z.input<typeof icalFormSchema>;
export type IcalFormValues = z.output<typeof icalFormSchema>;

export const termsFormSchema = z.object({
	termsContent: z.string().trim().min(1, "Terms content is required"),
});

export type TermsFormValues = z.infer<typeof termsFormSchema>;

// checkIn/checkOut come from calendar selection state, not a typed form field
// (same as the guest booking flow in Booking.tsx).
export const priceOverrideFormSchema = z.object({
	nightlyRate: z.coerce.number().min(0, "Must be 0 or more"),
	label: z.string().trim().max(255).optional().or(z.literal("")),
});

export type PriceOverrideFormInput = z.input<typeof priceOverrideFormSchema>;
export type PriceOverrideFormValues = z.output<typeof priceOverrideFormSchema>;
