import type { Context } from "@netlify/functions";
import dayjs from "dayjs";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { isoDateSchema } from "../../lib/booking";
import { getActiveReservationsOverlapping } from "../../lib/availability";
import {
	createManualBlock,
	deleteManualBlock,
	isManualBlockOverlapError,
	listManualBlocks,
} from "../../lib/manualBlocks";

const blockFieldsSchema = z
	.object({
		checkIn: isoDateSchema,
		checkOut: isoDateSchema,
		note: z.string().trim().max(500).optional(),
	})
	.refine((v) => dayjs(v.checkOut).isAfter(dayjs(v.checkIn)), {
		message: "checkOut must be after checkIn",
		path: ["checkOut"],
	});

// POST /api/admin-manual-blocks — manually close off a date range: { checkIn, checkOut, note? }.
// For dates the admin wants blocked with no guest or external-platform
// booking behind them (e.g. the cabin is closed, or family/friends are
// staying) — see db/schema.ts's manualBlocks comment.
const handleCreate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = blockFieldsSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid block", issues: parsed.error.issues }, 400);

	// A manual block exists to close off dates with no booking behind them —
	// it must never paper over an active guest reservation. The admin Bookings
	// calendar already shows reservations alongside open dates so this should
	// be rare in practice; this is the authoritative server-side guard.
	//
	// A manual block overlapping a synced Airbnb/Vrbo block is deliberately
	// allowed (e.g. an admin noting "family also staying" during a synced
	// stay) — it's a no-op for availability since the external block already
	// closes those dates on its own, and the calendar renders the external
	// block on top so it's never hidden (see BookingsCalendar.tsx).
	const overlapping = await getActiveReservationsOverlapping(parsed.data.checkIn, parsed.data.checkOut);
	if (overlapping.length > 0) {
		return error("This date range overlaps an existing reservation", 409);
	}

	try {
		const block = await createManualBlock({
			checkIn: parsed.data.checkIn,
			checkOut: parsed.data.checkOut,
			note: parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null,
		});
		return json({ block }, 201);
	} catch (e) {
		if (isManualBlockOverlapError(e)) {
			return error("This date range overlaps an existing manual block", 409);
		}
		throw e;
	}
};

// DELETE /api/admin-manual-blocks?id=<id>
const handleDelete = async (req: Request): Promise<Response> => {
	const id = Number(new URL(req.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) return error("A valid id is required");

	const deleted = await deleteManualBlock(id);
	if (!deleted) return error("Manual block not found", 404);
	return json({ deleted: true });
};

export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	try {
		switch (req.method) {
			case "GET":
				return json({ blocks: await listManualBlocks() });
			case "POST":
				return await handleCreate(req);
			case "DELETE":
				return await handleDelete(req);
			default:
				return error("Method not allowed", 405);
		}
	} catch (e) {
		console.error("admin-manual-blocks failed", e);
		return error("Request failed", 500);
	}
};
