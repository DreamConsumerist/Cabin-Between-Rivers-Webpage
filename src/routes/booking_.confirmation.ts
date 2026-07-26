import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BookingConfirmation } from "../pages/BookingConfirmation";

const searchSchema = z.object({
	reservationId: z.coerce.number().int().positive().optional(),
	sessionId: z.string().optional(),
});

export const Route = createFileRoute("/booking_/confirmation")({
	component: BookingConfirmation,
	validateSearch: searchSchema,
	// Personal/transactional — keyed to one guest's reservationId/sessionId,
	// not something a search result should ever point at.
	head: () => ({
		meta: [{ name: "robots", content: "noindex" }],
	}),
});
