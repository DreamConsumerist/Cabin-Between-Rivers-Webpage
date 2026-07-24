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
};

export type AvailabilityResult = {
	blocked: Array<BlockedRange>;
	pricing: Pricing | null;
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

export const uploadIdPhoto = (reservationId: number, file: File): Promise<{ ok: boolean }> => {
	const form = new FormData();
	form.set("reservationId", String(reservationId));
	form.set("file", file);
	return jsonFetch("/api/upload-id-photo", { method: "POST", body: form });
};
