import { createFileRoute } from "@tanstack/react-router";
import { Booking } from "../pages/Booking";

export const Route = createFileRoute("/booking")({
	component: Booking,
	head: () => ({
		meta: [
			{ title: "Book Your Stay | Cabin Between Rivers" },
			{
				name: "description",
				content: "Check availability and book your stay at Cabin Between Rivers directly — pick your dates, see the price, and reserve online.",
			},
		],
	}),
});
