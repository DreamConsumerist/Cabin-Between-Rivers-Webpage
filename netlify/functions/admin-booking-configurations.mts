import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import {
	createConfiguration,
	deleteConfiguration,
	listConfigurations,
	updateConfiguration,
} from "../../lib/bookingConfigurations";

const configurationFieldsSchema = z.object({
	name: z.string().trim().min(1).max(255),
	description: z.string().trim().max(2000).optional(),
	nightlyRate: z.number().int().min(0),
	cleaningFee: z.number().int().min(0),
	minNights: z.number().int().min(1),
	baseOccupancy: z.number().int().min(1),
	extraGuestFee: z.number().int().min(0),
	isDefault: z.boolean(),
});

const updateSchema = z
	.object({ id: z.number().int().positive() })
	.and(configurationFieldsSchema);

// POST /api/admin-booking-configurations — create a bookable configuration
// (e.g. "Whole Cabin" / "Downstairs Only").
const handleCreate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = configurationFieldsSchema.safeParse(parsedBody.body);
	if (!parsed.success)
		return json(
			{ error: "Invalid configuration", issues: parsed.error.issues },
			400
		);

	const configuration = await createConfiguration({
		...parsed.data,
		description:
			parsed.data.description && parsed.data.description.length > 0
				? parsed.data.description
				: null,
	});
	return json({ configuration }, 201);
};

// PATCH /api/admin-booking-configurations — update an existing configuration.
const handleUpdate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = updateSchema.safeParse(parsedBody.body);
	if (!parsed.success)
		return json(
			{ error: "Invalid configuration", issues: parsed.error.issues },
			400
		);

	const { id, ...fields } = parsed.data;
	const configuration = await updateConfiguration(id, {
		...fields,
		description:
			fields.description && fields.description.length > 0
				? fields.description
				: null,
	});
	if (!configuration) return error("Configuration not found", 404);
	return json({ configuration });
};

// DELETE /api/admin-booking-configurations?id=<id>
const handleDelete = async (req: Request): Promise<Response> => {
	const id = Number(new URL(req.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) return error("A valid id is required");

	const result = await deleteConfiguration(id);
	if (!result.ok) {
		if (result.reason === "is-default") {
			return error(
				"Can't delete the default configuration — make another one default first",
				409
			);
		}
		return error(
			"Can't delete a configuration that has reservations or price overrides",
			409
		);
	}
	return json({ deleted: true });
};

// GET/POST/PATCH/DELETE /api/admin-booking-configurations — CRUD for the
// bookable-configurations list (see db/schema.ts's bookingConfigurations).
// Admin-gated.
export default withErrorHandling(
	"admin-booking-configurations",
	async (req, _context) => {
		const unauthorized = requireAdmin(req);
		if (unauthorized) return unauthorized;

		try {
			switch (req.method) {
				case "GET":
					return json({ configurations: await listConfigurations() });
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
			console.error("admin-booking-configurations failed", e);
			return error("Request failed", 500);
		}
	}
);
