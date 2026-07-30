import { z } from "zod";

export const loginSchema = z.object({
	password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Rates are entered in dollars in the UI and converted to cents before
// hitting the API (the server, like the rest of the app, stores money in
// integer cents — see db/schema.ts). One bookingConfigurations row's editable
// fields (see db/schema.ts) — nightlyRate/cleaningFee/etc. used to live
// directly on settings; they now live per-configuration instead.
export const configurationFormSchema = z.object({
	name: z.string().trim().min(1, "Required"),
	description: z.string().trim().max(2000).optional().or(z.literal("")),
	nightlyRate: z.coerce.number().min(0, "Must be 0 or more"),
	cleaningFee: z.coerce.number().min(0, "Must be 0 or more"),
	minNights: z.coerce.number().int().min(1, "Must be at least 1"),
	baseOccupancy: z.coerce.number().int().min(1, "Must be at least 1"),
	extraGuestFee: z.coerce.number().min(0, "Must be 0 or more"),
});

export type ConfigurationFormInput = z.input<typeof configurationFormSchema>;
export type ConfigurationFormValues = z.output<typeof configurationFormSchema>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const icalFormSchema = z.object({
	airbnbIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
	vrboIcalUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
});

export type IcalFormInput = z.input<typeof icalFormSchema>;
export type IcalFormValues = z.output<typeof icalFormSchema>;

// Kept as one comma-separated string (matches settings.notificationEmails) —
// parsed into a list server-side, not here.
const commaSeparatedEmails = z
	.string()
	.trim()
	.optional()
	.or(z.literal(""))
	.refine(
		(value) => !value || value.split(",").every((part) => EMAIL_REGEX.test(part.trim())),
		"Enter a comma-separated list of valid email addresses"
	);

export const notificationsFormSchema = z.object({
	notificationEmails: commaSeparatedEmails,
});

export type NotificationsFormInput = z.input<typeof notificationsFormSchema>;
export type NotificationsFormValues = z.output<typeof notificationsFormSchema>;

export const termsFormSchema = z.object({
	termsContent: z.string().trim().min(1, "Terms content is required"),
});

export type TermsFormValues = z.infer<typeof termsFormSchema>;

// AKST wall-clock hour (see db/schema.ts's checkInReminderHour/
// checkOutReminderHour comment and SETUP.md's timezone convention) — entered
// here as a plain 0-23 hour, same as the server-side settings columns.
const reminderHour = z.coerce.number().int().min(0, "Must be 0-23").max(23, "Must be 0-23");

export const guestEmailsFormSchema = z.object({
	checkInInstructions: z.string().trim().min(1, "Check-in instructions are required"),
	checkOutInstructions: z.string().trim().min(1, "Check-out instructions are required"),
	checkInReminderHour: reminderHour,
	checkOutReminderHour: reminderHour,
});

export type GuestEmailsFormInput = z.input<typeof guestEmailsFormSchema>;
export type GuestEmailsFormValues = z.output<typeof guestEmailsFormSchema>;

// checkIn/checkOut come from calendar selection state, not a typed form field
// (same as the guest booking flow in Booking.tsx).
export const priceOverrideFormSchema = z.object({
	nightlyRate: z.coerce.number().min(0, "Must be 0 or more"),
	label: z.string().trim().max(255).optional().or(z.literal("")),
	recurring: z.boolean().default(false),
});

export type PriceOverrideFormInput = z.input<typeof priceOverrideFormSchema>;
export type PriceOverrideFormValues = z.output<typeof priceOverrideFormSchema>;
