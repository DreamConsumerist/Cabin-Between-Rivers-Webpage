import { createRoot } from "react-dom/client";
import dayjs from "dayjs";
import { BookingsCalendar } from "./src/features/admin/BookingsCalendar";
import type { AdminBooking } from "./src/features/admin/api";
import "./src/styles/tailwind.css";

const today = dayjs().startOf("month");

const mk = (
	id: number,
	dayOffset: number,
	nights: number,
	guestName: string,
	status: "pending" | "confirmed"
): AdminBooking => ({
	id,
	checkIn: today.add(dayOffset, "day").format("YYYY-MM-DD"),
	checkOut: today.add(dayOffset + nights, "day").format("YYYY-MM-DD"),
	guestName,
	guestEmail: "a@b.com",
	guestPhone: null,
	guests: 2,
	amountTotal: 10000,
	status,
	holdExpiresAt: null,
	createdAt: today.toISOString(),
	hasIdPhoto: false,
});

const reservations: Array<AdminBooking> = [
	mk(1, 2, 3, "Gregory Young", "confirmed"),
	mk(2, 7, 2, "Peggy Johnson", "confirmed"),
];

createRoot(document.getElementById("root")!).render(
	<div style={{ padding: 16 }}>
		<BookingsCalendar reservations={reservations} onSelect={() => {}} />
	</div>
);
