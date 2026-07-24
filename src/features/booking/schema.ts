import { z } from "zod";

// Mirrors the guest-detail fields of the server's createBookingSchema
// (lib/booking.ts) — checkIn/checkOut come from the calendar step, not this form.
export const guestDetailsSchema = z.object({
	guestName: z.string().trim().min(1, "Name is required").max(255),
	guestEmail: z.string().trim().email("Enter a valid email").max(255),
	guestPhone: z.string().trim().min(1, "Phone number is required").max(50),
	guests: z.coerce.number().int().min(1, "At least 1 guest").max(20, "Max 20 guests"),
});

// react-hook-form needs both shapes because of the `guests` coercion: the raw
// field value the form holds (input) vs. what the resolver produces on submit.
export type GuestDetailsInput = z.input<typeof guestDetailsSchema>;
export type GuestDetails = z.output<typeof guestDetailsSchema>;
