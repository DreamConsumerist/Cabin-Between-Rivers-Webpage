import type { Context } from "@netlify/functions";
import dayjs from "dayjs";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { isoDateSchema } from "../../lib/booking";
import {
	createPriceOverride,
	deletePriceOverride,
	getPriceOverrideById,
	isPriceOverrideOverlapError,
	listPriceOverrides,
	updatePriceOverride,
} from "../../lib/priceOverrides";

const overrideFieldsSchema = z
	.object({
		checkIn: isoDateSchema,
		checkOut: isoDateSchema,
		nightlyRate: z.number().int().min(0),
		label: z.string().trim().max(255).optional(),
	})
	.refine((v) => dayjs(v.checkOut).isAfter(dayjs(v.checkIn)), {
		message: "checkOut must be after checkIn",
		path: ["checkOut"],
	});

const updateSchema = z.object({ id: z.number().int().positive() }).and(overrideFieldsSchema);

// POST /api/admin-price-overrides — create a seasonal price override: { checkIn, checkOut, nightlyRate, label? }
const handleCreate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = overrideFieldsSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid price override", issues: parsed.error.issues }, 400);

	try {
		const override = await createPriceOverride({
			checkIn: parsed.data.checkIn,
			checkOut: parsed.data.checkOut,
			nightlyRate: parsed.data.nightlyRate,
			label: parsed.data.label && parsed.data.label.length > 0 ? parsed.data.label : null,
		});
		return json({ override }, 201);
	} catch (e) {
		if (isPriceOverrideOverlapError(e)) {
			return error("This date range overlaps an existing price override", 409);
		}
		throw e;
	}
};

// PATCH /api/admin-price-overrides — update an existing override: { id, checkIn, checkOut, nightlyRate, label? }
const handleUpdate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = updateSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid price override", issues: parsed.error.issues }, 400);

	const existing = await getPriceOverrideById(parsed.data.id);
	if (!existing) return error("Price override not found", 404);

	try {
		const override = await updatePriceOverride(parsed.data.id, {
			checkIn: parsed.data.checkIn,
			checkOut: parsed.data.checkOut,
			nightlyRate: parsed.data.nightlyRate,
			label: parsed.data.label && parsed.data.label.length > 0 ? parsed.data.label : null,
		});
		return json({ override });
	} catch (e) {
		if (isPriceOverrideOverlapError(e)) {
			return error("This date range overlaps an existing price override", 409);
		}
		throw e;
	}
};

// DELETE /api/admin-price-overrides?id=<id>
const handleDelete = async (req: Request): Promise<Response> => {
	const id = Number(new URL(req.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) return error("A valid id is required");

	const deleted = await deletePriceOverride(id);
	if (!deleted) return error("Price override not found", 404);
	return json({ deleted: true });
};

export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	try {
		switch (req.method) {
			case "GET":
				return json({ overrides: await listPriceOverrides() });
			case "POST":
				return await handleCreate(req);
			case "PATCH":
				return await handleUpdate(req);
			case "DELETE":
				return await handleDelete(req);
			default:
				return error("Method not allowed", 405);
		}
	} catch (e) {
		console.error("admin-price-overrides failed", e);
		return error("Request failed", 500);
	}
};
