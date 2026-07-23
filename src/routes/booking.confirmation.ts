import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BookingConfirmation } from "../pages/BookingConfirmation";

const searchSchema = z.object({
	reservationId: z.coerce.number().int().positive().optional(),
	sessionId: z.string().optional(),
});

export const Route = createFileRoute("/booking/confirmation")({
	component: BookingConfirmation,
	validateSearch: searchSchema,
});
