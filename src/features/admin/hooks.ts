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
	fetchAdminMe,
	fetchAdminSettings,
	updateAdminSettings,
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
