import type { FunctionComponent } from "../../common/types";
import { formatCents } from "../booking/dateUtilities";
import type { AdminBooking } from "./api";
import { useAdminBookings } from "./hooks";

const STATUS_STYLE: Record<AdminBooking["status"], string> = {
	pending: "bg-amber-100 text-amber-800",
	confirmed: "bg-green-100 text-green-800",
	expired: "bg-neutral-100 text-neutral-500",
	cancelled: "bg-neutral-100 text-neutral-500",
};

const formatDate = (iso: string): string =>
	new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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

export const BookingsList = (): FunctionComponent => {
	const { data, isPending, error } = useAdminBookings();
	const reservations = data?.reservations ?? [];

	if (isPending) return <p className="text-neutral-500">Loading bookings…</p>;
	if (error) return <p className="text-sm text-red-600">{error.message}</p>;
	if (reservations.length === 0) return <p className="text-neutral-500">No bookings yet.</p>;

	return (
		<ul className="flex flex-col gap-3">
			{reservations.map((reservation) => (
				<li
					key={reservation.id}
					className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
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
					</div>
				</li>
			))}
		</ul>
	);
};
