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
	createBookingConfiguration,
	createDiscountCode,
	createManualBlock,
	createPriceOverride,
	deleteBookingConfiguration,
	deleteDiscountCode,
	deleteManualBlock,
	deletePriceOverride,
	fetchAdminBookings,
	fetchAdminGuestEmails,
	fetchAdminIcal,
	fetchAdminMe,
	fetchAdminNotifications,
	fetchAdminSettings,
	fetchAdminTerms,
	fetchBookingConfigurations,
	fetchConflicts,
	fetchDiscountCodes,
	fetchPriceOverrides,
	regenerateExportToken,
	reopenConflict,
	resolveConflict,
	triggerAdminIcalSync,
	updateAdminGuestEmails,
	updateAdminIcal,
	updateAdminNotifications,
	updateAdminSettings,
	updateAdminTerms,
	updateBookingConfiguration,
	updatePriceOverride,
	type AdminBooking,
	type AdminExternalBlock,
	type AdminSettings,
	type BookingConfiguration,
	type BookingConfigurationInput,
	type Conflict,
	type DiscountCode,
	type DiscountCodeInput,
	type GuestEmailSettings,
	type IcalSettings,
	type IcalSyncSummary,
	type IcalUrls,
	type ManualBlock,
	type ManualBlockInput,
	type NotificationSettings,
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

export const useAdminNotifications = (): UseQueryResult<
	NotificationSettings,
	Error
> =>
	useQuery({
		queryKey: ["admin-notifications"],
		queryFn: fetchAdminNotifications,
	});

export const useUpdateAdminNotifications = (): UseMutationResult<
	NotificationSettings,
	Error,
	NotificationSettings
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: NotificationSettings) => updateAdminNotifications(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-notifications"] }),
	});
};

export const useAdminBookings = (): UseQueryResult<
	{
		reservations: Array<AdminBooking>;
		externalBlocks: Array<AdminExternalBlock>;
		manualBlocks: Array<ManualBlock>;
	},
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

export const useAdminGuestEmails = (): UseQueryResult<GuestEmailSettings, Error> =>
	useQuery({ queryKey: ["admin-guest-emails"], queryFn: fetchAdminGuestEmails });

export const useUpdateAdminGuestEmails = (): UseMutationResult<
	GuestEmailSettings,
	Error,
	GuestEmailSettings
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: GuestEmailSettings) => updateAdminGuestEmails(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-guest-emails"] }),
	});
};

const PRICE_OVERRIDES_QUERY_KEY = ["price-overrides"];

// Scoped per-configuration (see db/schema.ts's priceOverrides) — the
// Configurations tab's seasonal-pricing manager only ever edits one
// configuration's overrides at a time.
export const usePriceOverrides = (
	configurationId: number
): UseQueryResult<{ overrides: Array<PriceOverride>; allInstances: Array<PriceOverride> }, Error> =>
	useQuery({
		queryKey: [...PRICE_OVERRIDES_QUERY_KEY, configurationId],
		queryFn: () => fetchPriceOverrides(configurationId),
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

const BOOKING_CONFIGURATIONS_QUERY_KEY = ["booking-configurations"];

export const useBookingConfigurations = (): UseQueryResult<
	{ configurations: Array<BookingConfiguration> },
	Error
> =>
	useQuery({
		queryKey: BOOKING_CONFIGURATIONS_QUERY_KEY,
		queryFn: fetchBookingConfigurations,
	});

export const useCreateBookingConfiguration = (): UseMutationResult<
	{ configuration: BookingConfiguration },
	Error,
	BookingConfigurationInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: BookingConfigurationInput) => createBookingConfiguration(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: BOOKING_CONFIGURATIONS_QUERY_KEY }),
	});
};

export const useUpdateBookingConfiguration = (): UseMutationResult<
	{ configuration: BookingConfiguration },
	Error,
	{ id: number; input: BookingConfigurationInput }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: BookingConfigurationInput }) =>
			updateBookingConfiguration(id, input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: BOOKING_CONFIGURATIONS_QUERY_KEY }),
	});
};

export const useDeleteBookingConfiguration = (): UseMutationResult<
	{ deleted: boolean },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteBookingConfiguration(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: BOOKING_CONFIGURATIONS_QUERY_KEY }),
	});
};

const DISCOUNT_CODES_QUERY_KEY = ["discount-codes"];

export const useDiscountCodes = (): UseQueryResult<
	{ discountCodes: Array<DiscountCode> },
	Error
> =>
	useQuery({
		queryKey: DISCOUNT_CODES_QUERY_KEY,
		queryFn: fetchDiscountCodes,
	});

export const useCreateDiscountCode = (): UseMutationResult<
	{ discountCode: DiscountCode },
	Error,
	DiscountCodeInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: DiscountCodeInput) => createDiscountCode(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: DISCOUNT_CODES_QUERY_KEY }),
	});
};

export const useDeleteDiscountCode = (): UseMutationResult<
	{ deleted: boolean },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteDiscountCode(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: DISCOUNT_CODES_QUERY_KEY }),
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

// Manual blocks render on the Bookings tab's calendar via useAdminBookings —
// there's no separate manual-blocks view, so invalidating that one query key
// is enough to refresh every surface after a create/delete.
export const useCreateManualBlock = (): UseMutationResult<
	{ block: ManualBlock },
	Error,
	ManualBlockInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: ManualBlockInput) => createManualBlock(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
	});
};

export const useDeleteManualBlock = (): UseMutationResult<
	{ deleted: boolean },
	Error,
	number
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteManualBlock(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
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
