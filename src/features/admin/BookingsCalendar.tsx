import { useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { TextField } from "../../components/forms/TextField";
import type { DateSelection } from "../booking/Calendar";
import { getMonthGrid, toIsoDate } from "../booking/dateUtilities";
import type { AdminBooking, AdminExternalBlock, ManualBlock } from "./api";
import { useCreateManualBlock, useDeleteManualBlock } from "./hooks";

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

// Platform blocks are visually distinct from site reservations (rose/sky vs.
// amber/green) so an admin can tell at a glance which dates are held by an
// external calendar sync rather than a direct booking. There's no listing
// page on file (only the .ics sync URL is stored — see IcalForm.tsx), so a
// click opens the platform's homepage rather than the specific listing.
const PLATFORM_INFO: Record<
	AdminExternalBlock["source"],
	{ label: string; url: string; cellStyle: string; swatchStyle: string }
> = {
	airbnb: {
		label: "Airbnb",
		url: "https://www.airbnb.com",
		cellStyle: "border-rose-300 bg-rose-100 text-rose-800",
		swatchStyle: "border-rose-300 bg-rose-100",
	},
	vrbo: {
		label: "Vrbo",
		url: "https://www.vrbo.com",
		cellStyle: "border-sky-300 bg-sky-100 text-sky-800",
		swatchStyle: "border-sky-300 bg-sky-100",
	},
};

const MANUAL_CELL_STYLE = "border-violet-300 bg-violet-100 text-violet-800";
const MANUAL_SWATCH_STYLE = "border-violet-300 bg-violet-100";

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

const externalBlockForDate = (
	date: Dayjs,
	externalBlocks: Array<AdminExternalBlock>
): AdminExternalBlock | undefined =>
	externalBlocks.find(
		(b) =>
			!date.isBefore(dayjs(b.checkIn), "day") &&
			date.isBefore(dayjs(b.checkOut), "day")
	);

const manualBlockForDate = (
	date: Dayjs,
	manualBlocks: Array<ManualBlock>
): ManualBlock | undefined =>
	manualBlocks.find(
		(b) =>
			!date.isBefore(dayjs(b.checkIn), "day") &&
			date.isBefore(dayjs(b.checkOut), "day")
	);

type BookingsCalendarProps = {
	reservations: Array<AdminBooking>;
	externalBlocks: Array<AdminExternalBlock>;
	manualBlocks: Array<ManualBlock>;
	onSelect: (reservationId: number) => void;
};

// Visual, at-a-glance occupancy view sitting above the audit-log list: each
// reservation tints the nights it covers, so an admin can spot current/
// upcoming stays and gaps without reading through the list's date ranges.
// Synced Airbnb/Vrbo blocks and admin-created manual blocks (e.g. "family
// staying") are shown alongside, in their own colors — priority for a given
// date is reservation, then external block, then manual block. A reservation
// wins over an external block since that overlap is already surfaced as a
// conflict elsewhere (see ConflictsList.tsx). An external block wins over a
// manual block deliberately: an admin can still manually block dates a
// platform already covers (e.g. noting "family also staying" during a synced
// stay) — it's a no-op for availability since the external block closes those
// dates on its own — but the sync'd platform stays visible on the calendar
// rather than being silently hidden behind the manual block.
//
// This calendar doubles as the manual-block creation UI: clicking an open
// (unoccupied) day starts a check-in/check-out selection, same interaction as
// the guest booking Calendar. Reservations, external blocks, and existing
// manual blocks are never selectable as part of a new range — they always
// keep their own color and click behavior — so the admin sees any conflict
// before creating a block, and the backend rejects any range overlapping an
// active reservation regardless.
export const BookingsCalendar = ({
	reservations,
	externalBlocks,
	manualBlocks,
	onSelect,
}: BookingsCalendarProps): FunctionComponent => {
	const today = dayjs().startOf("day");
	const [visibleMonth, setVisibleMonth] = useState(() =>
		today.startOf("month")
	);
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);
	const [selection, setSelection] = useState<DateSelection>({ checkIn: null, checkOut: null });
	const [note, setNote] = useState("");
	const [blockPendingDelete, setBlockPendingDelete] = useState<ManualBlock | null>(null);
	const deleteManualBlock = useDeleteManualBlock();
	const createManualBlock = useCreateManualBlock();
	const days = getMonthGrid(visibleMonth);

	const clearSelection = (): void => {
		setSelection({ checkIn: null, checkOut: null });
		setNote("");
		createManualBlock.reset();
	};

	const handleOpenDayClick = (date: Dayjs): void => {
		const { checkIn, checkOut } = selection;
		if (!checkIn || !checkOut) {
			// First click: select just this one day ([date, date+1) — this
			// codebase's half-open convention) rather than waiting for a second
			// click before showing anything selected.
			setSelection({ checkIn: date, checkOut: date.add(1, "day") });
			return;
		}
		// A single-click selection always spans exactly one day; anything longer
		// means a range was already confirmed by a second click, so this third
		// click starts a fresh single-day selection instead of extending it.
		const isSingleDaySelection = checkOut.diff(checkIn, "day") === 1;
		if (!isSingleDaySelection) {
			setSelection({ checkIn: date, checkOut: date.add(1, "day") });
			return;
		}
		if (date.isSame(checkIn, "day")) {
			// Clicking the already-selected single day again deselects it.
			setSelection({ checkIn: null, checkOut: null });
			return;
		}
		// Second click, on a different day — extend into a range covering both.
		const rangeStart = date.isBefore(checkIn, "day") ? date : checkIn;
		const rangeEndInclusive = date.isBefore(checkIn, "day") ? checkIn : date;
		setSelection({ checkIn: rangeStart, checkOut: rangeEndInclusive.add(1, "day") });
	};

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
					const externalBlock = reservation
						? undefined
						: externalBlockForDate(date, externalBlocks);
					const manualBlock =
						reservation || externalBlock
							? undefined
							: manualBlockForDate(date, manualBlocks);
					const platform = externalBlock
						? PLATFORM_INFO[externalBlock.source]
						: undefined;
					const occupied = reservation ?? externalBlock ?? manualBlock;
					const isToday = date.isSame(today, "day");

					// [checkIn, checkOut) is half-open — checkOut is the exclusive
					// boundary, not a day being blocked, so it must never highlight
					// alongside the days actually being selected (that previously made
					// a single-day selection look like it covered two days).
					const isSelected =
						!occupied &&
						selection.checkIn &&
						selection.checkOut &&
						!date.isBefore(selection.checkIn, "day") &&
						date.isBefore(selection.checkOut, "day");

					const isCheckIn = reservation
						? date.isSame(reservation.checkIn, "day")
						: externalBlock
							? date.isSame(externalBlock.checkIn, "day")
							: manualBlock
								? date.isSame(manualBlock.checkIn, "day")
								: false;
					const hoverKey = reservation
						? `reservation-${reservation.id}`
						: externalBlock
							? `external-${externalBlock.id}`
							: manualBlock
								? `manual-${manualBlock.id}`
								: null;
					const title = reservation
						? `${reservation.guestName} · ${dayjs(reservation.checkIn).format("MMM D")} – ${dayjs(reservation.checkOut).format("MMM D")} · ${reservation.status}`
						: externalBlock && platform
							? `${platform.label} · ${dayjs(externalBlock.checkIn).format("MMM D")} – ${dayjs(externalBlock.checkOut).format("MMM D")}`
							: manualBlock
								? `${manualBlock.note ?? "Manually blocked"} · ${dayjs(manualBlock.checkIn).format("MMM D")} – ${dayjs(manualBlock.checkOut).format("MMM D")} · click to remove`
								: undefined;

					return (
						<button
							key={`${date.format("YYYY-MM-DD")}-${inMonth}`}
							title={title}
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
									: platform
										? `${platform.cellStyle} cursor-pointer`
										: manualBlock
											? `${MANUAL_CELL_STYLE} cursor-pointer`
											: isSelected
												? "border-brand-700 bg-brand-600 text-neutral-900 cursor-pointer"
												: "cursor-pointer border-neutral-200 text-neutral-700 hover:border-brand-400 hover:bg-brand-50",
								hoverKey && hoverKey === hoveredKey ? "brightness-90" : "",
								isToday ? "ring-1 ring-inset ring-brand-500" : "",
							].join(" ")}
							onClick={() => {
								if (reservation) {
									onSelect(reservation.id);
								} else if (platform) {
									window.open(platform.url, "_blank", "noopener,noreferrer");
								} else if (manualBlock) {
									setBlockPendingDelete(manualBlock);
								} else {
									handleOpenDayClick(date);
								}
							}}
							onMouseEnter={() => {
								if (!hoverKey) return;
								if (hoverClearTimeoutRef.current !== null) {
									clearTimeout(hoverClearTimeoutRef.current);
									hoverClearTimeoutRef.current = null;
								}
								setHoveredKey(hoverKey);
							}}
							onMouseLeave={() => {
								if (!hoverKey) return;
								const leftKey = hoverKey;
								hoverClearTimeoutRef.current = setTimeout(() => {
									setHoveredKey((current) => (current === leftKey ? null : current));
								}, HOVER_CLEAR_DELAY_MS);
							}}
						>
							<span className="leading-none">{date.date()}</span>
							{isCheckIn && (
								<span className="absolute inset-x-1.5 bottom-1.5 truncate text-center text-[9px] leading-tight">
									{reservation
										? reservation.guestName
										: platform
											? platform.label
											: (manualBlock?.note ?? "Blocked")}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{selection.checkIn && selection.checkOut && (
				<form
					className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!selection.checkIn || !selection.checkOut) return;
						createManualBlock.mutate(
							{
								checkIn: toIsoDate(selection.checkIn),
								checkOut: toIsoDate(selection.checkOut),
								note,
							},
							{ onSuccess: clearSelection }
						);
					}}
				>
					<p className="w-full text-sm text-neutral-600">
						{selection.checkIn.format("MMM D, YYYY")} – {selection.checkOut.format("MMM D, YYYY")}
					</p>
					<TextField
						label="Reason (optional)"
						maxLength={500}
						placeholder="e.g. Family staying, Airbnb closed"
						value={note}
						onChange={(event) => { setNote(event.target.value); }}
					/>
					<Button disabled={createManualBlock.isPending} type="submit">
						{createManualBlock.isPending
							? "Blocking…"
							: selection.checkOut.diff(selection.checkIn, "day") === 1
								? "Block this date"
								: "Block these dates"}
					</Button>
					<Button type="button" variant="secondary" onClick={clearSelection}>
						Cancel
					</Button>
					{createManualBlock.isError && (
						<p className="w-full text-sm text-red-600">{createManualBlock.error.message}</p>
					)}
				</form>
			)}

			<div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
				<span className="flex items-center gap-1.5">
					<span className="inline-block h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" />
					Pending
				</span>
				<span className="flex items-center gap-1.5">
					<span className="inline-block h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
					Confirmed
				</span>
				<span className="flex items-center gap-1.5">
					<span className={`inline-block h-3 w-3 rounded-sm border ${PLATFORM_INFO.airbnb.swatchStyle}`} />
					Airbnb
				</span>
				<span className="flex items-center gap-1.5">
					<span className={`inline-block h-3 w-3 rounded-sm border ${PLATFORM_INFO.vrbo.swatchStyle}`} />
					Vrbo
				</span>
				<span className="flex items-center gap-1.5">
					<span className={`inline-block h-3 w-3 rounded-sm border ${MANUAL_SWATCH_STYLE}`} />
					Manually blocked
				</span>
			</div>

			{blockPendingDelete && (
				<ConfirmDialog
					confirmLabel="Remove block"
					error={deleteManualBlock.error?.message}
					isPending={deleteManualBlock.isPending}
					message={`Remove this manual block (${dayjs(blockPendingDelete.checkIn).format("MMM D")} – ${dayjs(blockPendingDelete.checkOut).format("MMM D")})?`}
					title="Remove manual block"
					onCancel={() => {
						deleteManualBlock.reset();
						setBlockPendingDelete(null);
					}}
					onConfirm={() => {
						deleteManualBlock.mutate(blockPendingDelete.id, {
							onSuccess: () => { setBlockPendingDelete(null); },
						});
					}}
				/>
			)}
		</div>
	);
};
