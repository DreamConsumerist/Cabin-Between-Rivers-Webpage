import { jsonFetch } from "../../common/utilities";

export type AdminSettings = {
	id: number;
	configurationSwitchingEnabled: boolean;
	airbnbIcalUrl: string | null;
	vrboIcalUrl: string | null;
};

export type SettingsInput = {
	configurationSwitchingEnabled: boolean;
};

// A bookable configuration of the cabin (e.g. "Whole Cabin" / "Downstairs
// Only") — see db/schema.ts's bookingConfigurations. Each has its own
// pricing; availability blocking is shared across all of them (same
// physical property).
export type BookingConfiguration = {
	id: number;
	name: string;
	description: string | null;
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	baseOccupancy: number;
	extraGuestFee: number;
	isDefault: boolean;
	position: number;
};

export type BookingConfigurationInput = {
	name: string;
	description: string;
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	baseOccupancy: number;
	extraGuestFee: number;
	isDefault: boolean;
};

export const fetchBookingConfigurations = (): Promise<{
	configurations: Array<BookingConfiguration>;
}> => jsonFetch("/api/admin-booking-configurations");

export const createBookingConfiguration = (
	input: BookingConfigurationInput
): Promise<{ configuration: BookingConfiguration }> =>
	jsonFetch("/api/admin-booking-configurations", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const updateBookingConfiguration = (
	id: number,
	input: BookingConfigurationInput
): Promise<{ configuration: BookingConfiguration }> =>
	jsonFetch("/api/admin-booking-configurations", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, ...input }),
	});

export const deleteBookingConfiguration = (
	id: number
): Promise<{ deleted: boolean }> =>
	jsonFetch(`/api/admin-booking-configurations?id=${id}`, { method: "DELETE" });

export const fetchAdminMe = (): Promise<{ authenticated: boolean }> =>
	jsonFetch("/api/admin-me");

export const adminLogin = (password: string): Promise<{ ok: boolean }> =>
	jsonFetch("/api/admin-login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ password }),
	});

export const adminLogout = (): Promise<{ ok: boolean }> =>
	jsonFetch("/api/admin-logout", { method: "POST" });

export const fetchAdminSettings = (): Promise<{
	settings: AdminSettings | null;
}> => jsonFetch("/api/admin-settings");

export const updateAdminSettings = (
	input: SettingsInput
): Promise<{ settings: AdminSettings }> =>
	jsonFetch("/api/admin-settings", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export type IcalUrls = {
	airbnbIcalUrl: string;
	vrboIcalUrl: string;
};

export type IcalSettings = IcalUrls & {
	exportToken: string;
	exportUrl: string;
};

export type SourceSyncResult = {
	source: "airbnb" | "vrbo";
	ok: boolean;
	eventCount: number;
	inserted: number;
	updated: number;
	pruned: number;
	conflicts: number;
	error?: string;
};

export type IcalSyncSummary = {
	syncedAt: string;
	results: Array<SourceSyncResult>;
};

export const fetchAdminIcal = (): Promise<IcalSettings> =>
	jsonFetch("/api/admin-ical");

export const updateAdminIcal = (
	input: IcalUrls
): Promise<IcalSettings & { sync: IcalSyncSummary | null }> =>
	jsonFetch("/api/admin-ical", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const triggerAdminIcalSync = (): Promise<IcalSyncSummary> =>
	jsonFetch("/api/admin-ical-sync", { method: "POST" });

export const regenerateExportToken = (): Promise<{
	exportToken: string;
	exportUrl: string;
}> => jsonFetch("/api/admin-ical-export-token", { method: "POST" });

export const fetchAdminTerms = (): Promise<{ termsContent: string }> =>
	jsonFetch("/api/admin-terms");

export type NotificationSettings = {
	notificationEmails: string;
};

export const fetchAdminNotifications = (): Promise<NotificationSettings> =>
	jsonFetch("/api/admin-notifications");

export const updateAdminNotifications = (
	input: NotificationSettings
): Promise<NotificationSettings> =>
	jsonFetch("/api/admin-notifications", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export type AdminBooking = {
	id: number;
	configurationId: number;
	configurationName: string | null;
	checkIn: string;
	checkOut: string;
	guestName: string;
	guestEmail: string;
	guestPhone: string | null;
	guests: number;
	amountTotal: number;
	status: "pending" | "confirmed" | "expired" | "cancelled";
	holdExpiresAt: string | null;
	createdAt: string;
	hasIdPhoto: boolean;
};

export type AdminExternalBlock = {
	id: number;
	source: "airbnb" | "vrbo";
	checkIn: string;
	checkOut: string;
};

export type ManualBlock = {
	id: number;
	checkIn: string;
	checkOut: string;
	note: string | null;
	createdAt: string;
};

export type ManualBlockInput = {
	checkIn: string;
	checkOut: string;
	note: string;
};

export const fetchAdminBookings = (): Promise<{
	reservations: Array<AdminBooking>;
	externalBlocks: Array<AdminExternalBlock>;
	manualBlocks: Array<ManualBlock>;
}> => jsonFetch("/api/admin-bookings");

export const createManualBlock = (
	input: ManualBlockInput
): Promise<{ block: ManualBlock }> =>
	jsonFetch("/api/admin-manual-blocks", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const deleteManualBlock = (id: number): Promise<{ deleted: boolean }> =>
	jsonFetch(`/api/admin-manual-blocks?id=${id}`, { method: "DELETE" });

export const updateAdminTerms = (
	termsContent: string
): Promise<{ termsContent: string }> =>
	jsonFetch("/api/admin-terms", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ termsContent }),
	});

export type PriceOverride = {
	id: number;
	configurationId: number;
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string | null;
	recurring: boolean;
};

export type PriceOverrideInput = {
	configurationId: number;
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string;
	recurring?: boolean;
};

export const fetchPriceOverrides = (
	configurationId: number
): Promise<{
	overrides: Array<PriceOverride>;
}> => jsonFetch(`/api/admin-price-overrides?configurationId=${configurationId}`);

export const createPriceOverride = (
	input: PriceOverrideInput
): Promise<{ override: PriceOverride }> =>
	jsonFetch("/api/admin-price-overrides", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const updatePriceOverride = (
	id: number,
	input: PriceOverrideInput
): Promise<{ override: PriceOverride }> =>
	jsonFetch("/api/admin-price-overrides", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, ...input }),
	});

export const deletePriceOverride = (
	id: number
): Promise<{ deleted: boolean }> =>
	jsonFetch(`/api/admin-price-overrides?id=${id}`, { method: "DELETE" });

export type DoubleBookingSource =
	| "airbnb-sync"
	| "vrbo-sync"
	| "stripe-webhook";

export type Conflict = {
	id: number;
	source: DoubleBookingSource;
	checkIn: string;
	checkOut: string;
	detail: string;
	reservationId: number | null;
	resolvedAt: string | null;
	resolutionNote: string | null;
	createdAt: string;
};

export const fetchConflicts = (
	resolved?: boolean
): Promise<{ conflicts: Array<Conflict> }> =>
	jsonFetch(
		`/api/admin-conflicts${resolved === undefined ? "" : `?resolved=${resolved}`}`
	);

export const resolveConflict = (
	id: number,
	note: string
): Promise<{ conflict: Conflict }> =>
	jsonFetch("/api/admin-conflicts", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, resolved: true, note }),
	});

export const reopenConflict = (id: number): Promise<{ conflict: Conflict }> =>
	jsonFetch("/api/admin-conflicts", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, resolved: false }),
	});

export const adminCancelReservation = (
	reservationId: number
): Promise<{ reservation: AdminBooking; refunded: boolean }> =>
	jsonFetch("/api/admin-cancel-reservation", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reservationId }),
	});
