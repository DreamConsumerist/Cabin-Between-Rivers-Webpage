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
	airbnbIcalUrl: string;
	vrboIcalUrl: string;
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
