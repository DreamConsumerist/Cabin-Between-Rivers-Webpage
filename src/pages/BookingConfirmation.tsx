import { useEffect } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import type { FunctionComponent } from "../common/types";
import { useReservationStatus } from "../features/booking/hooks";

const route = getRouteApi("/booking_/confirmation");

// Long enough for the guest to actually read the confirmation before being
// sent home, short enough that it doesn't feel like the page is stuck.
const REDIRECT_HOME_DELAY_MS = 5000;

export const BookingConfirmation = (): FunctionComponent => {
	const { reservationId } = route.useSearch();
	const statusQuery = useReservationStatus(reservationId ?? null);
	const status = statusQuery.data?.status;
	const navigate = useNavigate();

	useEffect(() => {
		if (status !== "confirmed") return;
		const timeout = setTimeout(() => {
			void navigate({ to: "/" });
		}, REDIRECT_HOME_DELAY_MS);
		return () => { clearTimeout(timeout); };
	}, [status, navigate]);

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
							A confirmation email will be sent to you shortly.
						</p>
						<p className="text-sm text-neutral-400">
							Taking you back to the home page…
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
