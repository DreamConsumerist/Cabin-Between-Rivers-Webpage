import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import type { FunctionComponent } from "../../common/types";
import type { BlockedRange, PriceOverride, Pricing } from "./api";
import {
	formatCentsCompact,
	getMonthGrid,
	isDateBlocked,
	isRangeBlocked,
	nightlyRateForDate,
} from "./dateUtilities";

export type DateSelection = { checkIn: Dayjs | null; checkOut: Dayjs | null };

type CalendarProps = {
	blocked: Array<BlockedRange>;
	pricing: Pricing | null;
	priceOverrides: Array<PriceOverride>;
	selection: DateSelection;
	onChange: (selection: DateSelection) => void;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Click-to-select range calendar: first click sets check-in, second sets
// check-out. Clicking the same day again clears the selection; clicking before
// check-in restarts from there; a range that would cross a blocked date instead
// restarts the selection at the newly clicked day.
export const Calendar = ({
	blocked,
	pricing,
	priceOverrides,
	selection,
	onChange,
}: CalendarProps): FunctionComponent => {
	const today = dayjs().startOf("day");
	const [visibleMonth, setVisibleMonth] = useState(() => today.startOf("month"));

	const days = getMonthGrid(visibleMonth);
	const { checkIn, checkOut } = selection;
	const canGoPrevious = visibleMonth.isAfter(today, "month");

	const handleDayClick = (date: Dayjs): void => {
		if (!checkIn || checkOut) {
			onChange({ checkIn: date, checkOut: null });
			return;
		}
		if (date.isSame(checkIn, "day")) {
			onChange({ checkIn: null, checkOut: null });
			return;
		}
		if (date.isBefore(checkIn, "day") || isRangeBlocked(checkIn, date, blocked)) {
			onChange({ checkIn: date, checkOut: null });
			return;
		}
		onChange({ checkIn, checkOut: date });
	};

	return (
		<div className="w-full">
			<div className="mb-3 flex items-center justify-between">
				<button
					aria-label="Previous month"
					className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
					disabled={!canGoPrevious}
					type="button"
					onClick={() => { setVisibleMonth((m) => m.subtract(1, "month")); }}
				>
					‹
				</button>
				<span className="font-medium">{visibleMonth.format("MMMM YYYY")}</span>
				<button
					aria-label="Next month"
					className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
					type="button"
					onClick={() => { setVisibleMonth((m) => m.add(1, "month")); }}
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
					const isPast = date.isBefore(today, "day");
					const blockedDay = isDateBlocked(date, blocked);
					const disabled = !inMonth || isPast || blockedDay;
					const isEndpoint =
						(checkIn && date.isSame(checkIn, "day")) || (checkOut && date.isSame(checkOut, "day"));
					const inRange =
						checkIn &&
						checkOut &&
						date.isAfter(checkIn, "day") &&
						date.isBefore(checkOut, "day");
					const rateCents = pricing
						? nightlyRateForDate(date, pricing.nightlyRate, priceOverrides)
						: null;

					return (
						<button
							key={`${date.format("YYYY-MM-DD")}-${inMonth}`}
							disabled={disabled}
							type="button"
							className={[
								"flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border text-sm transition-colors",
								!inMonth ? "invisible" : "",
								disabled && inMonth
									? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-300"
									: "",
								!disabled && inMonth && !isEndpoint && !inRange
									? "border-neutral-200 hover:border-brand-400 hover:bg-brand-50"
									: "",
								isEndpoint ? "border-brand-700 bg-brand-600 text-neutral-900" : "",
								inRange ? "border-brand-200 bg-brand-200" : "",
							].join(" ")}
							onClick={() => { handleDayClick(date); }}
						>
							<span>{date.date()}</span>
							{inMonth && !isPast && !blockedDay && rateCents != null && (
								<span
									className={[
										"text-[10px] leading-none",
										isEndpoint || inRange ? "text-neutral-700" : "text-neutral-500",
									].join(" ")}
								>
									{formatCentsCompact(rateCents)}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
};
