import { formatCents } from "../booking/dateUtilities";
import type { AdminBooking } from "./api";

// Shared between BookingsList's overflow-menu cancel action and
// ConflictsList's cancel-and-refund button so both surfaces show identical
// wording for the same action.
export const cancelConfirmMessage = (reservation: AdminBooking): string =>
	reservation.status === "confirmed"
		? `Cancel reservation #${reservation.id} (${reservation.guestName}) and refund ${formatCents(reservation.amountTotal)}? This cannot be undone.`
		: `Cancel reservation #${reservation.id} (${reservation.guestName})? Nothing has been charged yet. This cannot be undone.`;
