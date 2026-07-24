import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	adminCancelReservation,
	adminLogin,
	adminLogout,
	createPriceOverride,
	deletePriceOverride,
	fetchAdminBookings,
	fetchAdminIcal,
	fetchAdminMe,
	fetchAdminSettings,
	fetchAdminTerms,
	fetchConflicts,
	fetchPriceOverrides,
	regenerateExportToken,
	reopenConflict,
	resolveConflict,
	triggerAdminIcalSync,
	updateAdminIcal,
	updateAdminSettings,
	updateAdminTerms,
	updatePriceOverride,
	type AdminBooking,
	type AdminSettings,
	type Conflict,
	type IcalSettings,
	type IcalSyncSummary,
	type IcalUrls,
	type PriceOverride,
	type PriceOverrideInput,
	type SettingsInput,
} from "./api";

const ADMIN_ME_QUERY_KEY = ["admin-me"];

export const useAdminMe = (): UseQueryResult<
	{ authenticated: boolean },
	Error
> => useQuery({ queryKey: ADMIN_ME_QUERY_KEY, queryFn: fetchAdminMe });

export const useAdminLogin = (): UseMutationResult<
	{ ok: boolean },
	Error,
	string
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (password: string) => adminLogin(password),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ADMIN_ME_QUERY_KEY }),
	});
};

export const useAdminLogout = (): UseMutationResult<
	{ ok: boolean },
	Error,
	void
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => adminLogout(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ADMIN_ME_QUERY_KEY }),
	});
};

export const useAdminSettings = (): UseQueryResult<
	{ settings: AdminSettings | null },
	Error
> => useQuery({ queryKey: ["admin-settings"], queryFn: fetchAdminSettings });

export const useUpdateAdminSettings = (): UseMutationResult<
	{ settings: AdminSettings },
	Error,
	SettingsInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SettingsInput) => updateAdminSettings(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-settings"] }),
	});
};

export const useAdminIcal = (): UseQueryResult<IcalSettings, Error> =>
	useQuery({ queryKey: ["admin-ical"], queryFn: fetchAdminIcal });

export const useUpdateAdminIcal = (): UseMutationResult<
	IcalSettings & { sync: IcalSyncSummary | null },
	Error,
	IcalUrls
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: IcalUrls) => updateAdminIcal(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-ical"] }),
	});
};

export const useTriggerIcalSync = (): UseMutationResult<
	IcalSyncSummary,
	Error,
	void
> => useMutation({ mutationFn: () => triggerAdminIcalSync() });

export const useRegenerateExportToken = (): UseMutationResult<
	{ exportToken: string; exportUrl: string },
	Error,
	void
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => regenerateExportToken(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-ical"] }),
	});
};

export const useAdminTerms = (): UseQueryResult<
	{ termsContent: string },
	Error
> => useQuery({ queryKey: ["admin-terms"], queryFn: fetchAdminTerms });

export const useAdminBookings = (): UseQueryResult<
	{ reservations: Array<AdminBooking> },
	Error
> => useQuery({ queryKey: ["admin-bookings"], queryFn: fetchAdminBookings });

export const useUpdateAdminTerms = (): UseMutationResult<
	{ termsContent: string },
	Error,
	string
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (termsContent: string) => updateAdminTerms(termsContent),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-terms"] }),
	});
};

const PRICE_OVERRIDES_QUERY_KEY = ["price-overrides"];

export const usePriceOverrides = (): UseQueryResult<
	{ overrides: Array<PriceOverride> },
	Error
> =>
	useQuery({
		queryKey: PRICE_OVERRIDES_QUERY_KEY,
		queryFn: fetchPriceOverrides,
	});

export const useCreatePriceOverride = (): UseMutationResult<
	{ override: PriceOverride },
	Error,
	PriceOverrideInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: PriceOverrideInput) => createPriceOverride(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: PRICE_OVERRIDES_QUERY_KEY }),
	});
};

export const useUpdatePriceOverride = (): UseMutationResult<
	{ override: PriceOverride },
	Error,
	{ id: number; input: PriceOverrideInput }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: PriceOverrideInput }) =>
			updatePriceOverride(id, input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: PRICE_OVERRIDES_QUERY_KEY }),
	});
};

export const useDeletePriceOverride = (): UseMutationResult<
	{ deleted: boolean },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deletePriceOverride(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: PRICE_OVERRIDES_QUERY_KEY }),
	});
};

const CONFLICTS_QUERY_KEY = ["conflicts"];

// resolved is folded into the query key so the Conflicts tab's own list and
// the Admin.tsx tab badge (both calling useConflicts(false)) share one cache
// entry instead of double-fetching.
export const useConflicts = (
	resolved?: boolean
): UseQueryResult<{ conflicts: Array<Conflict> }, Error> =>
	useQuery({
		queryKey: [...CONFLICTS_QUERY_KEY, resolved ?? "all"],
		queryFn: () => fetchConflicts(resolved),
	});

export const useResolveConflict = (): UseMutationResult<
	{ conflict: Conflict },
	Error,
	{ id: number; note: string }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, note }: { id: number; note: string }) =>
			resolveConflict(id, note),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: CONFLICTS_QUERY_KEY }),
	});
};

export const useReopenConflict = (): UseMutationResult<
	{ conflict: Conflict },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => reopenConflict(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: CONFLICTS_QUERY_KEY }),
	});
};

// Admin-authority cancel + refund — used by both the Conflicts tab (which
// additionally chains a resolveConflict call on success) and the Bookings
// tab's overflow menu (standalone). Invalidates admin-bookings so both
// surfaces reflect the new status immediately; does NOT invalidate conflicts
// itself since not every cancel is tied to one.
export const useAdminCancelReservation = (): UseMutationResult<
	{ reservation: AdminBooking; refunded: boolean },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (reservationId: number) =>
			adminCancelReservation(reservationId),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
	});
};
