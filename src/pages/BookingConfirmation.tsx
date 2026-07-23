import { getRouteApi, Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../common/types";
import { useReservationStatus } from "../features/booking/hooks";

const route = getRouteApi("/booking/confirmation");

export const BookingConfirmation = (): FunctionComponent => {
	const { reservationId } = route.useSearch();
	const statusQuery = useReservationStatus(reservationId ?? null);
	const status = statusQuery.data?.status;

	return (
		<main className="flex min-h-[60vh] w-full items-center justify-center">
			<div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
				{!reservationId && (
					<p className="text-red-600">Missing reservation reference.</p>
				)}

				{reservationId && (status === undefined || status === "pending") && (
					<>
						<h1 className="text-2xl font-semibold">Confirming your payment…</h1>
						<p className="text-neutral-500">
							This usually takes just a few seconds.
						</p>
					</>
				)}

				{status === "confirmed" && (
					<>
						<h1 className="text-2xl font-semibold text-brand-700">
							You're booked!
						</h1>
						<p className="text-neutral-600">
							Reservation #{reservationId} is confirmed. We look forward to
							hosting you.
						</p>
					</>
				)}

				{(status === "expired" || status === "cancelled") && (
					<>
						<h1 className="text-2xl font-semibold text-red-600">
							Payment not completed
						</h1>
						<p className="text-neutral-600">
							Your hold on these dates has lapsed.
						</p>
						<Link className="text-brand-700 underline" to="/booking">
							Start a new booking
						</Link>
					</>
				)}
			</div>
		</main>
	);
};
