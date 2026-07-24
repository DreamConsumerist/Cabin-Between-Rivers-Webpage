import {
	useMutation,
	useQuery,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	cancelReservation,
	createBooking,
	createPayment,
	fetchAvailability,
	fetchReservationStatus,
	uploadIdPhoto,
	type AvailabilityResult,
	type CreateBookingInput,
	type CreateBookingResult,
	type ReservationStatus,
} from "./api";

export const useAvailability = (): UseQueryResult<AvailabilityResult, Error> =>
	useQuery({ queryKey: ["availability"], queryFn: fetchAvailability });

export const useCreateBooking = (): UseMutationResult<
	CreateBookingResult,
	Error,
	CreateBookingInput
> => useMutation({ mutationFn: (input: CreateBookingInput) => createBooking(input) });

export const useCreatePayment = (): UseMutationResult<
	{ clientSecret: string },
	Error,
	number
> => useMutation({ mutationFn: (reservationId: number) => createPayment(reservationId) });

export const useCancelReservation = (): UseMutationResult<
	{ cancelled: boolean },
	Error,
	number
> => useMutation({ mutationFn: (reservationId: number) => cancelReservation(reservationId) });

export const useUploadIdPhoto = (): UseMutationResult<
	{ ok: boolean },
	Error,
	{ reservationId: number; file: File }
> =>
	useMutation({
		mutationFn: ({ reservationId, file }) => uploadIdPhoto(reservationId, file),
	});

// Polls until the webhook flips the reservation to a terminal state.
export const useReservationStatus = (
	reservationId: number | null
): UseQueryResult<{ status: ReservationStatus }, Error> =>
	useQuery({
		queryKey: ["reservation-status", reservationId],
		queryFn: () => fetchReservationStatus(reservationId as number),
		enabled: reservationId != null,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? 2000 : false),
	});
