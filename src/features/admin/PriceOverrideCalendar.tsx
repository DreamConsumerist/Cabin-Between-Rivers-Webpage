import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import type { FunctionComponent } from "../../common/types";
import type { DateSelection } from "../booking/Calendar";
import { formatCents, getMonthGrid } from "../booking/dateUtilities";
import type { PriceOverride } from "./api";

type PriceOverrideCalendarProps = {
	overrides: Array<PriceOverride>;
	selection: DateSelection;
	onChange: (selection: DateSelection) => void;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const overrideForDate = (date: Dayjs, overrides: Array<PriceOverride>): PriceOverride | undefined =>
	overrides.find(
		(o) => !date.isBefore(dayjs(o.checkIn), "day") && date.isBefore(dayjs(o.checkOut), "day")
	);

// Admin date-range picker for setting seasonal price overrides. Unlike the
// guest booking Calendar, no day is disabled here — there's no "blocked"
// concept, and the backend's EXCLUDE constraint (not this UI) is the source
// of truth for rejecting an overlapping selection. Existing override ranges
// are tinted with their rate so the admin can see current seasonal pricing
// at a glance before picking a new range.
export const PriceOverrideCalendar = ({
	overrides,
	selection,
	onChange,
}: PriceOverrideCalendarProps): FunctionComponent => {
	const today = dayjs().startOf("day");
	const [visibleMonth, setVisibleMonth] = useState(() => today.startOf("month"));

	const days = getMonthGrid(visibleMonth);
	const { checkIn, checkOut } = selection;

	const handleDayClick = (date: Dayjs): void => {
		if (!checkIn || checkOut) {
			onChange({ checkIn: date, checkOut: null });
			return;
		}
		if (date.isSame(checkIn, "day")) {
			onChange({ checkIn: null, checkOut: null });
			return;
		}
		if (date.isBefore(checkIn, "day")) {
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
					className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
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
					const override = overrideForDate(date, overrides);
					const isEndpoint =
						(checkIn && date.isSame(checkIn, "day")) || (checkOut && date.isSame(checkOut, "day"));
					const inRange =
						checkIn && checkOut && date.isAfter(checkIn, "day") && date.isBefore(checkOut, "day");

					return (
						<button
							key={date.format("YYYY-MM-DD")}
							title={override ? `${formatCents(override.nightlyRate)}/night${override.label ? ` — ${override.label}` : ""}` : undefined}
							type="button"
							className={[
								"flex aspect-square flex-col items-center justify-center rounded-md border text-sm transition-colors",
								!inMonth ? "invisible" : "",
								isEndpoint ? "border-brand-700 bg-brand-600 text-neutral-900" : "",
								inRange && !isEndpoint ? "border-brand-200 bg-brand-200" : "",
								!isEndpoint && !inRange && override
									? "border-amber-300 bg-amber-50 hover:border-amber-400"
									: "",
								!isEndpoint && !inRange && !override
									? "border-neutral-200 hover:border-brand-400 hover:bg-brand-50"
									: "",
							].join(" ")}
							onClick={() => { handleDayClick(date); }}
						>
							<span>{date.date()}</span>
							{override && !isEndpoint && (
								<span className="text-[9px] leading-none text-amber-700">
									{formatCents(override.nightlyRate)}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
};
