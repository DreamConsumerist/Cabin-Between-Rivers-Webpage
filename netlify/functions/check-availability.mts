import { error, json, requireMethod, withErrorHandling } from "../../lib/http";
import { getBlockedRanges, getSettings } from "../../lib/availability";
import {
	listConfigurations,
	resolveConfiguration,
} from "../../lib/bookingConfigurations";
import { listPriceOverrides } from "../../lib/priceOverrides";

// GET /api/check-availability?configurationId=<id> -> { blocked: [...], pricing: {...} | null, priceOverrides: [...], configurationSwitchingEnabled, configurations: [...] }
// The frontend calendar uses `blocked` to disable unavailable dates and
// `pricing` + `priceOverrides` to show an estimated total before the guest
// commits to a booking. `blocked` is shared across every configuration (same
// physical property — see bookingConfigurations in db/schema.ts); `pricing`
// and `priceOverrides` are specific to whichever configuration was requested
// (or the default, if configurationId is omitted). `configurations` +
// `configurationSwitchingEnabled` let the booking flow render its
// configuration-picker step without a second request. Only the public-facing
// settings fields are returned (never the iCal source URLs).
export default withErrorHandling(
	"check-availability",
	async (req, _context) => {
		const notAllowed = requireMethod(req, "GET");
		if (notAllowed) return notAllowed;

		const configurationIdParam = new URL(req.url).searchParams.get(
			"configurationId"
		);
		const configurationId = configurationIdParam
			? Number(configurationIdParam)
			: null;
		if (
			configurationIdParam &&
			(!Number.isInteger(configurationId) || (configurationId ?? 0) <= 0)
		) {
			return error("Invalid configurationId");
		}

		try {
			const [blocked, settings, configuration, configurations] =
				await Promise.all([
					getBlockedRanges(),
					getSettings(),
					resolveConfiguration(configurationId),
					listConfigurations(),
				]);
			if (configurationId != null && !configuration) {
				return error("Unknown configuration", 400);
			}
			const overrides = configuration
				? await listPriceOverrides(configuration.id)
				: [];

			return json({
				blocked,
				pricing: configuration
					? {
							nightlyRate: configuration.nightlyRate,
							cleaningFee: configuration.cleaningFee,
							minNights: configuration.minNights,
							baseOccupancy: configuration.baseOccupancy,
							extraGuestFee: configuration.extraGuestFee,
						}
					: null,
				priceOverrides: overrides.map((o) => ({
					checkIn: o.checkIn,
					checkOut: o.checkOut,
					nightlyRate: o.nightlyRate,
					label: o.label,
				})),
				configurationSwitchingEnabled:
					settings?.configurationSwitchingEnabled ?? false,
				configurations: configurations.map((c) => ({
					id: c.id,
					name: c.name,
					description: c.description,
					nightlyRate: c.nightlyRate,
					cleaningFee: c.cleaningFee,
					minNights: c.minNights,
					baseOccupancy: c.baseOccupancy,
					extraGuestFee: c.extraGuestFee,
				})),
			});
		} catch (e) {
			console.error("check-availability failed", e);
			return error("Failed to load availability", 500);
		}
	}
);
