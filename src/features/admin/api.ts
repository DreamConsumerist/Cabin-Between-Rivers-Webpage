import { jsonFetch } from "../../common/utilities";

export type AdminSettings = {
	id: number;
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	airbnbIcalUrl: string | null;
	vrboIcalUrl: string | null;
};

export type SettingsInput = {
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
};

export const fetchAdminMe = (): Promise<{ authenticated: boolean }> => jsonFetch("/api/admin-me");

export const adminLogin = (password: string): Promise<{ ok: boolean }> =>
	jsonFetch("/api/admin-login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ password }),
	});

export const adminLogout = (): Promise<{ ok: boolean }> =>
	jsonFetch("/api/admin-logout", { method: "POST" });

export const fetchAdminSettings = (): Promise<{ settings: AdminSettings | null }> =>
	jsonFetch("/api/admin-settings");

export const updateAdminSettings = (input: SettingsInput): Promise<{ settings: AdminSettings }> =>
	jsonFetch("/api/admin-settings", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export type IcalSettings = {
	airbnbIcalUrl: string;
	vrboIcalUrl: string;
	notificationEmails: string;
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

export type IcalSyncSummary = { syncedAt: string; results: Array<SourceSyncResult> };

export const fetchAdminIcal = (): Promise<IcalSettings> => jsonFetch("/api/admin-ical");

export const updateAdminIcal = (
	input: IcalSettings
): Promise<IcalSettings & { sync: IcalSyncSummary | null }> =>
	jsonFetch("/api/admin-ical", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const triggerAdminIcalSync = (): Promise<IcalSyncSummary> =>
	jsonFetch("/api/admin-ical-sync", { method: "POST" });

export const fetchAdminTerms = (): Promise<{ termsContent: string }> =>
	jsonFetch("/api/admin-terms");

export type AdminBooking = {
	id: number;
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

export const fetchAdminBookings = (): Promise<{ reservations: Array<AdminBooking> }> =>
	jsonFetch("/api/admin-bookings");

export const updateAdminTerms = (termsContent: string): Promise<{ termsContent: string }> =>
	jsonFetch("/api/admin-terms", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ termsContent }),
	});

export type PriceOverride = {
	id: number;
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string | null;
};

export type PriceOverrideInput = {
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string;
};

export const fetchPriceOverrides = (): Promise<{ overrides: Array<PriceOverride> }> =>
	jsonFetch("/api/admin-price-overrides");

export const createPriceOverride = (input: PriceOverrideInput): Promise<{ override: PriceOverride }> =>
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

export const deletePriceOverride = (id: number): Promise<{ deleted: boolean }> =>
	jsonFetch(`/api/admin-price-overrides?id=${id}`, { method: "DELETE" });
