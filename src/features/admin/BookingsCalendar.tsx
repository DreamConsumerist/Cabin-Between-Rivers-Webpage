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

// A split-day cell's two triangles otherwise share one exact diagonal edge,
// which makes two similarly-colored bookings (e.g. both confirmed, both
// green) blend into what looks like a single uninterrupted stay. Shrinking
// each triangle's hypotenuse inward by this many pixels — see the two
// clip-path polygons below — leaves a sliver of the cell's own background
// showing as a visible seam between them.
const SPLIT_GAP_PX = 2;

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

// The other side of a turnover day: something departing exactly on `date`,
// keyed on checkOut rather than range containment. [checkIn, checkOut) never
// attributes the checkOut day itself to the departing item (see the
// *ForDate functions above), so without this, a departure gets no
// representation at all whenever another item checks in the same day — the
// arriving item's color/label just silently wins the whole cell.
const reservationDepartingOnDate = (
	date: Dayjs,
	reservations: Array<AdminBooking>
): ActiveBooking | undefined =>
	reservations.filter(isActive).find((r) => date.isSame(r.checkOut, "day"));

const externalBlockDepartingOnDate = (
	date: Dayjs,
	externalBlocks: Array<AdminExternalBlock>
): AdminExternalBlock | undefined => externalBlocks.find((b) => date.isSame(b.checkOut, "day"));

const manualBlockDepartingOnDate = (
	date: Dayjs,
	manualBlocks: Array<ManualBlock>
): ManualBlock | undefined => manualBlocks.find((b) => date.isSame(b.checkOut, "day"));

type OccupantInfo = { cellStyle: string; label: string; title: string };

// Resolves whichever of the three (at most one, by construction — see
// callers) into the display info a cell needs. Shared between the arriving
// and departing side of a day so both are described identically.
const describeOccupant = (
	reservation: ActiveBooking | undefined,
	externalBlock: AdminExternalBlock | undefined,
	manualBlock: ManualBlock | undefined
): OccupantInfo | undefined => {
	if (reservation) {
		return {
			cellStyle: STATUS_CELL_STYLE[reservation.status],
			label: reservation.guestName,
			title: `${reservation.guestName} · ${dayjs(reservation.checkIn).format("MMM D")} – ${dayjs(reservation.checkOut).format("MMM D")} · ${reservation.status}`,
		};
	}
	if (externalBlock) {
		const platform = PLATFORM_INFO[externalBlock.source];
		return {
			cellStyle: platform.cellStyle,
			label: platform.label,
			title: `${platform.label} · ${dayjs(externalBlock.checkIn).format("MMM D")} – ${dayjs(externalBlock.checkOut).format("MMM D")}`,
		};
	}
	if (manualBlock) {
		return {
			cellStyle: MANUAL_CELL_STYLE,
			label: manualBlock.note ?? "Blocked",
			title: `${manualBlock.note ?? "Manually blocked"} · ${dayjs(manualBlock.checkIn).format("MMM D")} – ${dayjs(manualBlock.checkOut).format("MMM D")}`,
		};
	}
	return undefined;
};

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
	// Which single occupant's key is currently hovered. Deliberately one key,
	// not a per-cell set — see hoverHandlersFor below for why hover listeners
	// live on each color region individually rather than on the day cell as a
	// whole.
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);

	// A turnover day's button is one element, but its two triangles represent
	// two unrelated occupants — attaching hover to the *button* would broadcast
	// both sides' keys the instant the pointer entered either triangle, which
	// is exactly the bug this fixes (hovering the check-out half lighting up
	// the check-in half too). Attaching these to each triangle span instead
	// means the browser's own clip-path hit-testing decides which one the
	// pointer is actually over, for free.
	const hoverHandlersFor = (key: string | null): { onMouseEnter: () => void; onMouseLeave: () => void } => ({
		onMouseEnter: (): void => {
			if (!key) return;
			if (hoverClearTimeoutRef.current !== null) {
				clearTimeout(hoverClearTimeoutRef.current);
				hoverClearTimeoutRef.current = null;
			}
			setHoveredKey(key);
		},
		onMouseLeave: (): void => {
			if (!key) return;
			hoverClearTimeoutRef.current = setTimeout(() => {
				setHoveredKey((current) => (current === key ? null : current));
			}, HOVER_CLEAR_DELAY_MS);
		},
	});
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
					// A full night (occupied, but not itself the check-in day) stays a
					// plain solid-colored cell, same as always. Check-in and check-out
					// are each their own half of their own day — always, not only when
					// a second item happens to share it — so `arriving` only applies on
					// the exact check-in day, independent of whether anything's also
					// departing that same day.
					const occupiedInfo = describeOccupant(reservation, externalBlock, manualBlock);
					const isMiddleOccupied = Boolean(occupiedInfo) && !isCheckIn;
					const arriving = isCheckIn ? occupiedInfo : undefined;

					// Checked on every day (not just check-in days): a checkout with no
					// same-day check-in still gets its own half — this is the case that
					// used to render as a plain, fully available day with no trace of
					// the checkout at all. Skipped when this date is a genuine mid-stay
					// night (isMiddleOccupied) — a departure landing inside another
					// item's active stay would mean the two overlap, a data conflict
					// already surfaced elsewhere, not something this cosmetic split
					// should try to render.
					const departingReservation = isMiddleOccupied
						? undefined
						: reservationDepartingOnDate(date, reservations);
					const departingExternalBlock =
						!isMiddleOccupied && !departingReservation
							? externalBlockDepartingOnDate(date, externalBlocks)
							: undefined;
					const departingManualBlock =
						!isMiddleOccupied && !departingReservation && !departingExternalBlock
							? manualBlockDepartingOnDate(date, manualBlocks)
							: undefined;
					const departing = describeOccupant(departingReservation, departingExternalBlock, departingManualBlock);
					const departingPlatform = departingExternalBlock ? PLATFORM_INFO[departingExternalBlock.source] : undefined;
					const hasSplit = !isMiddleOccupied && Boolean(arriving || departing);

					// Click falls back to the departing side when there's no arriving
					// occupant — so a reservation's checkout day acts like part of
					// that reservation (clicking it does the same thing clicking any
					// of its other days does) instead of behaving like an empty,
					// unrelated day just because it's not "occupied" for blocking
					// purposes.
					const arrivingHoverKey = reservation
						? `reservation-${reservation.id}`
						: externalBlock
							? `external-${externalBlock.id}`
							: manualBlock
								? `manual-${manualBlock.id}`
								: null;
					const departingHoverKey = departingReservation
						? `reservation-${departingReservation.id}`
						: departingExternalBlock
							? `external-${departingExternalBlock.id}`
							: departingManualBlock
								? `manual-${departingManualBlock.id}`
								: null;
					const isDepartingHovered = departingHoverKey !== null && hoveredKey === departingHoverKey;
					const isArrivingHovered = arrivingHoverKey !== null && hoveredKey === arrivingHoverKey;

					const baseTitle =
						departing && arriving
							? `${departing.title} → ${arriving.title}`
							: (departing?.title ?? arriving?.title);
					const clickTargetsManualBlock = manualBlock ?? (arriving ? undefined : departingManualBlock);
					const title = clickTargetsManualBlock && baseTitle ? `${baseTitle} · click to remove` : baseTitle;

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
								// its grid column) grow or shrink. overflow-hidden keeps the
								// occupant-color overlays (below) from poking past this box's own
								// rounded corners, since clip-path polygons don't know about
								// border-radius.
								//
								// The button itself never carries an occupant's color or a hover
								// filter — see the overlay span(s) below instead. An occupied cell
								// is always at least one color region (the whole cell for a plain
								// night, one or two triangles for a check-in/check-out day), and
								// each region highlights independently; a filter on the button
								// would cascade to every region (and the day number) at once,
								// which is exactly the "both triangles light up together" bug this
								// replaced.
								"relative flex aspect-square items-center justify-center overflow-hidden rounded-md border text-sm transition-colors",
								!inMonth ? "invisible" : "",
								isMiddleOccupied || hasSplit
									? "border-neutral-300 cursor-pointer"
									: isSelected
										? "border-brand-700 bg-brand-600 text-neutral-900 cursor-pointer"
										: "cursor-pointer border-neutral-200 text-neutral-700 hover:border-brand-400 hover:bg-brand-50",
								isToday ? "ring-1 ring-inset ring-brand-500" : "",
							].join(" ")}
							onClick={() => {
								if (reservation) {
									onSelect(reservation.id);
								} else if (platform) {
									window.open(platform.url, "_blank", "noopener,noreferrer");
								} else if (manualBlock) {
									setBlockPendingDelete(manualBlock);
								} else if (departingReservation) {
									onSelect(departingReservation.id);
								} else if (departingPlatform) {
									window.open(departingPlatform.url, "_blank", "noopener,noreferrer");
								} else if (departingManualBlock) {
									setBlockPendingDelete(departingManualBlock);
								} else {
									handleOpenDayClick(date);
								}
							}}
						>
							{/* A plain mid-stay night: one color, the whole cell. Its own
							overlay (rather than the button's own background, as it used to
							be) so hovering it can brighten just this region — same mechanism
							as the two triangles below — without a filter on the button
							cascading onto the day-number text too. Hover listeners live here,
							not on the button, so a turnover day's two regions each answer to
							the pointer independently (see hoverHandlersFor). */}
							{isMiddleOccupied && occupiedInfo && (
								<span
									aria-hidden="true"
									className={`absolute inset-0 ${occupiedInfo.cellStyle} ${isArrivingHovered ? "brightness-90" : ""}`}
									{...hoverHandlersFor(arrivingHoverKey)}
								/>
							)}
							{/* Departing half: the checkout side of the day, upper-left of
							the "/" diagonal. Rendered whenever anything departs today —
							standalone (rest of the cell stays blank/available, below) or
							alongside an arriving half if something else checks in the same
							day. This is the side that used to get no representation at all:
							checkout is the exclusive end of [checkIn, checkOut), so on its
							own day nothing ever marked it. */}
							{departing && (
								<span
									aria-hidden="true"
									className={`absolute inset-0 ${departing.cellStyle} ${isDepartingHovered ? "brightness-90" : ""}`}
									style={{
										clipPath: `polygon(0 0, calc(100% - ${SPLIT_GAP_PX}px) 0, 0 calc(100% - ${SPLIT_GAP_PX}px))`,
									}}
									{...hoverHandlersFor(departingHoverKey)}
								/>
							)}
							{/* Arriving half: the check-in side, lower-right of the diagonal.
							Rendered on every check-in day, standalone or paired with a
							departing half above — previously this side always claimed the
							*entire* cell instead of just its own half. */}
							{arriving && (
								<span
									aria-hidden="true"
									className={`absolute inset-0 ${arriving.cellStyle} ${isArrivingHovered ? "brightness-90" : ""}`}
									style={{
										clipPath: `polygon(100% ${SPLIT_GAP_PX}px, 100% 100%, ${SPLIT_GAP_PX}px 100%)`,
									}}
									{...hoverHandlersFor(arrivingHoverKey)}
								/>
							)}
							{/* pointer-events-none on both: purely decorative text sitting
							on top of the color region(s) above — without this, hovering
							anywhere behind the day number or the guest-name label would hit
							these instead and never reach the triangle/overlay underneath,
							silently breaking the per-region hover they're layered on top of. */}
							<span className="relative pointer-events-none leading-none">{date.date()}</span>
							{isCheckIn && arriving && (
								<span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate text-center text-[9px] leading-tight">
									{arriving.label}
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
