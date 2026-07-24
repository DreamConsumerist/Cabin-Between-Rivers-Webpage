import { useState } from "react";
import dayjs from "dayjs";
import type { FunctionComponent } from "../../common/types";
import { DropdownMenu } from "../../components/ui/DropdownMenu";
import { formatCents } from "../booking/dateUtilities";
import type { AdminBooking } from "./api";
import { BookingsCalendar } from "./BookingsCalendar";
import { useAdminBookings, useAdminCancelReservation } from "./hooks";

const STATUS_STYLE: Record<AdminBooking["status"], string> = {
	pending: "bg-amber-100 text-amber-800",
	confirmed: "bg-green-100 text-green-800",
	expired: "bg-neutral-100 text-neutral-500",
	cancelled: "bg-neutral-100 text-neutral-500",
};

// checkIn/checkOut are date-only strings ("YYYY-MM-DD"); `new Date(iso)`
// parses those as UTC midnight, which `toLocaleDateString` then renders in
// the browser's local timezone — off by a day west of UTC. dayjs parses the
// same string as local midnight instead, matching how the guest-facing
// Calendar already handles these dates.
const formatDate = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

// Guest phone is free-text (see src/features/booking/schema.ts), so only
// reformat it when it's unambiguously a US number — anything else (an
// international number, extra characters) is shown exactly as entered rather
// than mangled by a guess.
const formatPhone = (phone: string): string => {
	const digits = phone.replace(/\D/g, "");
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	if (digits.length === 11 && digits.startsWith("1")) {
		return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
	}
	return phone;
};

// `tel:` wants digits only (plus an optional leading "+" for a country code
// the guest already typed) — not the parenthesized/dashed display format.
const toTelHref = (phone: string): string => {
	const hasCountryCode = phone.trim().startsWith("+");
	return `tel:${hasCountryCode ? "+" : ""}${phone.replace(/\D/g, "")}`;
};

// Tucked into the overflow menu rather than an always-visible button —
// cancelling is a rare, exceptional action here (compare the Conflicts tab,
// where it's the primary/expected action and shown as a plain button).
const BookingActionsMenu = ({ reservation }: { reservation: AdminBooking }): FunctionComponent => {
	const cancelReservation = useAdminCancelReservation();
	const isRefund = reservation.status === "confirmed";

	return (
		<DropdownMenu label="Booking actions">
			<button
				className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
				disabled={cancelReservation.isPending}
				type="button"
				onClick={() => {
					const message = isRefund
						? `Cancel reservation #${reservation.id} (${reservation.guestName}) and refund ${formatCents(reservation.amountTotal)}? This cannot be undone.`
						: `Cancel reservation #${reservation.id} (${reservation.guestName})? Nothing has been charged yet. This cannot be undone.`;
					if (!confirm(message)) return;
					cancelReservation.mutate(reservation.id);
				}}
			>
				{isRefund ? "Cancel & refund" : "Cancel reservation"}
			</button>
		</DropdownMenu>
	);
};

// Briefly rings the selected list item so a calendar click has a visible
// destination, then clears itself — same pattern as a URL-hash scroll target,
// without needing routing.
const HIGHLIGHT_MS = 2000;

export const BookingsList = (): FunctionComponent => {
	const { data, isPending, error } = useAdminBookings();
	const reservations = data?.reservations ?? [];
	const [highlightedId, setHighlightedId] = useState<number | null>(null);

	const handleSelectFromCalendar = (reservationId: number): void => {
		setHighlightedId(reservationId);
		document
			.getElementById(`booking-${reservationId}`)
			?.scrollIntoView({ behavior: "smooth", block: "center" });
		setTimeout(() => {
			setHighlightedId((current) => (current === reservationId ? null : current));
		}, HIGHLIGHT_MS);
	};

	if (isPending) return <p className="text-neutral-500">Loading bookings…</p>;
	if (error) return <p className="text-sm text-red-600">{error.message}</p>;

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="mb-2 text-sm font-semibold text-neutral-700">Calendar</h2>
				{reservations.length === 0 ? (
					<p className="text-neutral-500">No bookings yet.</p>
				) : (
					<BookingsCalendar reservations={reservations} onSelect={handleSelectFromCalendar} />
				)}
			</div>

			{reservations.length > 0 && (
				<div>
					<h2 className="mb-2 text-sm font-semibold text-neutral-700">All bookings</h2>
					<ul className="flex flex-col gap-3">
						{reservations.map((reservation) => (
							<li
								key={reservation.id}
								id={`booking-${reservation.id}`}
								className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
									highlightedId === reservation.id
										? "border-brand-500 ring-2 ring-brand-300"
										: "border-neutral-200"
								}`}
							>
								<div>
									<p className="font-medium text-neutral-800">
										{reservation.guestName}{" "}
										<span className="text-neutral-400">
											· {reservation.guests} guest{reservation.guests === 1 ? "" : "s"}
										</span>
									</p>
									<p className="text-sm text-neutral-500">
										{formatDate(reservation.checkIn)} – {formatDate(reservation.checkOut)} ·{" "}
										{formatCents(reservation.amountTotal)}
									</p>
									<p className="text-sm text-neutral-500">
										{reservation.guestEmail}
										{reservation.guestPhone && (
											<>
												{" · "}
												<a className="underline" href={toTelHref(reservation.guestPhone)}>
													{formatPhone(reservation.guestPhone)}
												</a>
											</>
										)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-3">
									<span
										className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[reservation.status]}`}
									>
										{reservation.status}
									</span>
									{reservation.hasIdPhoto ? (
										<a
											className="text-sm text-brand-700 underline"
											href={`/api/admin-id-photo?reservationId=${reservation.id}`}
											rel="noreferrer"
											target="_blank"
										>
											View ID
										</a>
									) : (
										<span className="text-sm text-neutral-400">No ID uploaded</span>
									)}
									{(reservation.status === "confirmed" || reservation.status === "pending") && (
										<BookingActionsMenu reservation={reservation} />
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
};
