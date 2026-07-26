import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CancelReservation } from "../pages/CancelReservation";

const searchSchema = z.object({
	reservationId: z.coerce.number().int().positive().optional(),
	token: z.string().optional(),
});

export const Route = createFileRoute("/booking_/cancel")({
	component: CancelReservation,
	validateSearch: searchSchema,
});
