import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	adminLogin,
	adminLogout,
	fetchAdminBookings,
	fetchAdminMe,
	fetchAdminSettings,
	fetchAdminTerms,
	updateAdminSettings,
	updateAdminTerms,
	type AdminBooking,
	type AdminSettings,
	type SettingsInput,
} from "./api";

const ADMIN_ME_QUERY_KEY = ["admin-me"];

export const useAdminMe = (): UseQueryResult<{ authenticated: boolean }, Error> =>
	useQuery({ queryKey: ADMIN_ME_QUERY_KEY, queryFn: fetchAdminMe });

export const useAdminLogin = (): UseMutationResult<{ ok: boolean }, Error, string> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (password: string) => adminLogin(password),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_ME_QUERY_KEY }),
	});
};

export const useAdminLogout = (): UseMutationResult<{ ok: boolean }, Error, void> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => adminLogout(),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_ME_QUERY_KEY }),
	});
};

export const useAdminSettings = (): UseQueryResult<{ settings: AdminSettings | null }, Error> =>
	useQuery({ queryKey: ["admin-settings"], queryFn: fetchAdminSettings });

export const useUpdateAdminSettings = (): UseMutationResult<
	{ settings: AdminSettings },
	Error,
	SettingsInput
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SettingsInput) => updateAdminSettings(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-settings"] }),
	});
};

export const useAdminTerms = (): UseQueryResult<{ termsContent: string }, Error> =>
	useQuery({ queryKey: ["admin-terms"], queryFn: fetchAdminTerms });

export const useAdminBookings = (): UseQueryResult<{ reservations: Array<AdminBooking> }, Error> =>
	useQuery({ queryKey: ["admin-bookings"], queryFn: fetchAdminBookings });

export const useUpdateAdminTerms = (): UseMutationResult<
	{ termsContent: string },
	Error,
	string
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (termsContent: string) => updateAdminTerms(termsContent),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-terms"] }),
	});
};
