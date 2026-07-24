import { useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import type { FunctionComponent } from "../../common/types";
import { getMonthGrid } from "../booking/dateUtilities";
import type { AdminBooking } from "./api";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Adjacent day cells are separated by the grid's gap, so the pointer is
// briefly over no cell at all while dragging across a reservation's own
// cells — without this delay the highlight flickers off and back on at
// every gap crossing.
const HOVER_CLEAR_DELAY_MS = 75;

const STATUS_CELL_STYLE: Record<"pending" | "confirmed", string> = {
	pending: "border-amber-300 bg-amber-100 text-amber-800",
	confirmed: "border-green-300 bg-green-100 text-green-800",
};

type ActiveBooking = AdminBooking & { status: "pending" | "confirmed" };

const isActive = (r: AdminBooking): r is ActiveBooking =>
	r.status === "pending" || r.status === "confirmed";

// Only pending/confirmed reservations occupy the calendar — cancelled and
// expired ones freed their dates, and stay visible only in the list below.
const reservationForDate = (
	date: Dayjs,
	reservations: Array<AdminBooking>
): ActiveBooking | undefined =>
	reservations
		.filter(isActive)
		.find(
			(r) =>
				!date.isBefore(dayjs(r.checkIn), "day") &&
				date.isBefore(dayjs(r.checkOut), "day")
		);

type BookingsCalendarProps = {
	reservations: Array<AdminBooking>;
	onSelect: (reservationId: number) => void;
};

// Visual, at-a-glance occupancy view sitting above the audit-log list: each
// reservation tints the nights it covers, so an admin can spot current/
// upcoming stays and gaps without reading through the list's date ranges.
export const BookingsCalendar = ({
	reservations,
	onSelect,
}: BookingsCalendarProps): FunctionComponent => {
	const today = dayjs().startOf("day");
	const [visibleMonth, setVisibleMonth] = useState(() =>
		today.startOf("month")
	);
	const [hoveredReservationId, setHoveredReservationId] = useState<
		number | null
	>(null);
	const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);
	const days = getMonthGrid(visibleMonth);

	return (
		<div className="w-full rounded-xl border border-neutral-200 p-4">
			<div className="mb-3 flex items-center justify-between">
				<button
					aria-label="Previous month"
					className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
					type="button"
					onClick={() => {
						setVisibleMonth((m) => m.subtract(1, "month"));
					}}
				>
					‹
				</button>
				<span className="font-medium">{visibleMonth.format("MMMM YYYY")}</span>
				<button
					aria-label="Next month"
					className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
					type="button"
					onClick={() => {
						setVisibleMonth((m) => m.add(1, "month"));
					}}
				>
					›
				</button>
			</div>

			<div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
				{WEEKDAY_LABELS.map((label) => (
					<div key={label}>{label}</div>
				))}
			</div>

			<div className="grid grid-cols-7 gap-1">
				{days.map(({ date, inMonth }) => {
					const reservation = reservationForDate(date, reservations);
					const isCheckIn =
						reservation && date.isSame(reservation.checkIn, "day");
					const isToday = date.isSame(today, "day");

					return (
						<button
							key={`${date.format("YYYY-MM-DD")}-${inMonth}`}
							disabled={!reservation}
							type="button"
							className={[
								// Square, and stays square: nothing here changes size based on
								// the guest-name label. The label is an absolutely-positioned
								// overlay (below) rather than a second flex line, so it can
								// never make this box (or, via aspect-ratio's transferred sizing,
								// its grid column) grow or shrink.
								"relative flex aspect-square items-center justify-center rounded-md border text-sm transition-colors",
								!inMonth ? "invisible" : "",
								reservation
									? `${STATUS_CELL_STYLE[reservation.status]} cursor-pointer`
									: "cursor-default border-neutral-200 text-neutral-700",
								reservation && reservation.id === hoveredReservationId
									? "brightness-90"
									: "",
								isToday ? "ring-1 ring-inset ring-brand-500" : "",
							].join(" ")}
							title={
								reservation
									? `${reservation.guestName} · ${dayjs(reservation.checkIn).format("MMM D")} – ${dayjs(reservation.checkOut).format("MMM D")} · ${reservation.status}`
									: undefined
							}
							onClick={() => {
								if (reservation) onSelect(reservation.id);
							}}
							onMouseEnter={() => {
								if (!reservation) return;
								if (hoverClearTimeoutRef.current !== null) {
									clearTimeout(hoverClearTimeoutRef.current);
									hoverClearTimeoutRef.current = null;
								}
								setHoveredReservationId(reservation.id);
							}}
							onMouseLeave={() => {
								if (!reservation) return;
								const leftReservationId = reservation.id;
								hoverClearTimeoutRef.current = setTimeout(() => {
									setHoveredReservationId((current) =>
										current === leftReservationId ? null : current
									);
								}, HOVER_CLEAR_DELAY_MS);
							}}
						>
							<span className="leading-none">{date.date()}</span>
							{isCheckIn && (
								<span className="absolute inset-x-1.5 bottom-1.5 truncate text-center text-[9px] leading-tight">
									{reservation.guestName}
								</span>
							)}
						</button>
					);
				})}
			</div>

			<div className="mt-3 flex gap-4 text-xs text-neutral-500">
				<span className="flex items-center gap-1.5">
					<span className="inline-block h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" />
					Pending
				</span>
				<span className="flex items-center gap-1.5">
					<span className="inline-block h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
					Confirmed
				</span>
			</div>
		</div>
	);
};
