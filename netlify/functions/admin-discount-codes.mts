import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import {
	createDiscountCode,
	deleteDiscountCode,
	listDiscountCodes,
} from "../../lib/discountCodes";
import { DISCOUNT_TYPES } from "../../db/schema";

const discountCodeFieldsSchema = z.object({
	code: z.string().trim().min(1).max(50),
	discountType: z.enum(DISCOUNT_TYPES),
	// percent: 1-100; flat: cents, must be positive — a zero-value code
	// wouldn't do anything, so it's rejected here rather than silently accepted.
	discountValue: z.number().int().min(1),
});

// POST /api/admin-discount-codes — create a discount code.
const handleCreate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = discountCodeFieldsSchema.safeParse(parsedBody.body);
	if (!parsed.success) {
		return json({ error: "Invalid discount code", issues: parsed.error.issues }, 400);
	}
	if (parsed.data.discountType === "percent" && parsed.data.discountValue > 100) {
		return error("A percentage discount can't exceed 100");
	}

	try {
		const discountCode = await createDiscountCode(parsed.data);
		return json({ discountCode }, 201);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (/duplicate key|unique constraint/i.test(message)) {
			return error("A code with that name already exists", 409);
		}
		throw e;
	}
};

// DELETE /api/admin-discount-codes?id=<id>
const handleDelete = async (req: Request): Promise<Response> => {
	const id = Number(new URL(req.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) return error("A valid id is required");

	const result = await deleteDiscountCode(id);
	if (!result.ok) {
		return error("Can't delete a code that's already been applied to a reservation", 409);
	}
	return json({ deleted: true });
};

// GET/POST/DELETE /api/admin-discount-codes — CRUD for discount codes (see
// db/schema.ts's discountCodes). No PATCH: codes are add-or-remove only, not
// edited in place. Admin-gated.
export default withErrorHandling("admin-discount-codes", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	try {
		switch (req.method) {
			case "GET":
				return json({ discountCodes: await listDiscountCodes() });
			case "POST":
				return await handleCreate(req);
			case "DELETE":
				return await handleDelete(req);
			default:
				return error("Method not allowed", 405);
		}
	} catch (e) {
		console.error("admin-discount-codes failed", e);
		return error("Request failed", 500);
	}
});
