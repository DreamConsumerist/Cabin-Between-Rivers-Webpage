import { jsonFetch } from "../../common/utilities";

export type BlockedRange = {
	checkIn: string;
	checkOut: string;
	source: "reservation" | "airbnb" | "vrbo";
};

export type Pricing = {
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	baseOccupancy: number;
	extraGuestFee: number;
};

export type PriceOverride = {
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string | null;
};

export type AvailabilityResult = {
	blocked: Array<BlockedRange>;
	pricing: Pricing | null;
	priceOverrides: Array<PriceOverride>;
};

export type CreateBookingInput = {
	checkIn: string;
	checkOut: string;
	guestName: string;
	guestEmail: string;
	guestPhone: string;
	guests: number;
};

export type CreateBookingResult = {
	reservationId: number;
	amountTotal: number;
	holdExpiresAt: string;
	nights: number;
};

export type ReservationStatus = "pending" | "confirmed" | "expired" | "cancelled";

export const fetchAvailability = (): Promise<AvailabilityResult> =>
	jsonFetch("/api/check-availability");

export const createBooking = (input: CreateBookingInput): Promise<CreateBookingResult> =>
	jsonFetch("/api/create-booking", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

export const createPayment = (reservationId: number): Promise<{ clientSecret: string }> =>
	jsonFetch("/api/create-payment", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reservationId }),
	});

export const fetchReservationStatus = (
	reservationId: number
): Promise<{ status: ReservationStatus }> =>
	jsonFetch(`/api/reservation-status?reservationId=${reservationId}`);

export const cancelReservation = (reservationId: number): Promise<{ cancelled: boolean }> =>
	jsonFetch("/api/cancel-reservation", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reservationId }),
	});

// The confirmed-booking counterpart to cancelReservation above — token-gated
// (see db/schema.ts's cancellationToken, cancel-my-reservation.mts), reached
// from a link in the guest's own confirmation email rather than same-session
// in-app state, so it works days/weeks later without a login. `reason` is
// either the reservation's own status (not confirmed — already cancelled,
// expired, or still pending) or "too_close_to_checkin" (confirmed, but
// within cancel-my-reservation.mts's 24h-before-check-in cutoff — which also
// covers during/after the stay, since "now" is trivially past that deadline
// once check-in itself has happened).
export type CancellableReservation =
	| { eligible: true; checkIn: string; checkOut: string; guests: number; amountTotal: number }
	| { eligible: false; reason: ReservationStatus | "too_close_to_checkin" };

export const fetchCancellableReservation = (
	reservationId: number,
	token: string
): Promise<CancellableReservation> =>
	jsonFetch(
		`/api/cancel-my-reservation?reservationId=${reservationId}&token=${encodeURIComponent(token)}`
	);

export const cancelMyReservation = (
	reservationId: number,
	token: string
): Promise<{ cancelled: boolean }> =>
	jsonFetch("/api/cancel-my-reservation", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reservationId, token }),
	});

export const uploadIdPhoto = (reservationId: number, file: File): Promise<{ ok: boolean }> => {
	const form = new FormData();
	form.set("reservationId", String(reservationId));
	form.set("file", file);
	return jsonFetch("/api/upload-id-photo", { method: "POST", body: form });
};
