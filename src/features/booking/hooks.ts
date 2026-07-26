import {
	useMutation,
	useQuery,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	cancelMyReservation,
	cancelReservation,
	createBooking,
	createPayment,
	fetchAvailability,
	fetchCancellableReservation,
	fetchReservationStatus,
	uploadIdPhoto,
	type AvailabilityResult,
	type CancellableReservation,
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

// Backs the cancel-my-reservation page's initial load — reservationId/token
// come from the email link's URL, both required before the query can run.
// retry: false since a bad/mismatched token is a deterministic 404, not a
// transient failure — the app-wide default (3 retries with backoff) would
// otherwise leave the page reading "Loading…" for several extra seconds
// before ever showing "we couldn't find this reservation."
export const useCancellableReservation = (
	reservationId: number | null,
	token: string | null
): UseQueryResult<CancellableReservation, Error> =>
	useQuery({
		queryKey: ["cancellable-reservation", reservationId, token],
		queryFn: () => fetchCancellableReservation(reservationId as number, token as string),
		enabled: reservationId != null && token != null,
		retry: false,
	});

export const useCancelMyReservation = (): UseMutationResult<
	{ cancelled: boolean },
	Error,
	{ reservationId: number; token: string }
> =>
	useMutation({
		mutationFn: ({ reservationId, token }) => cancelMyReservation(reservationId, token),
	});
