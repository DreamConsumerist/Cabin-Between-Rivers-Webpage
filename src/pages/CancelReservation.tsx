import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { getRouteApi, Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../common/types";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { formatCents } from "../features/booking/dateUtilities";
import { useCancelMyReservation, useCancellableReservation } from "../features/booking/hooks";

const route = getRouteApi("/booking_/cancel");

const REASON_MESSAGE: Record<string, string> = {
	cancelled: "This reservation has already been cancelled.",
	expired: "This reservation's hold has already expired — there's nothing to cancel.",
	pending: "This reservation hasn't been confirmed yet, so there's nothing to cancel here.",
	too_close_to_checkin:
		"This reservation is too close to (or past) check-in to cancel online. Please contact us directly.",
};

export const CancelReservation = (): FunctionComponent => {
	const { reservationId, token } = route.useSearch();
	const query = useCancellableReservation(reservationId ?? null, token ?? null);
	const cancel = useCancelMyReservation();
	const [confirming, setConfirming] = useState(false);

	if (!reservationId || !token) {
		return (
			<CenteredMessage title="Invalid link">
				<p className="text-neutral-600">
					This cancellation link is missing some information. Please use the
					link from your confirmation email, or contact us directly.
				</p>
			</CenteredMessage>
		);
	}

	if (query.isPending) {
		return (
			<CenteredMessage title="Loading your reservation…">
				<p className="text-neutral-500">This usually takes just a few seconds.</p>
			</CenteredMessage>
		);
	}

	if (query.isError) {
		return (
			<CenteredMessage title="We couldn't find this reservation">
				<p className="text-neutral-600">
					This link may be invalid or expired. If you think this is a
					mistake, contact us directly.
				</p>
			</CenteredMessage>
		);
	}

	if (cancel.isSuccess) {
		return (
			<CenteredMessage title="Reservation cancelled" tone="brand">
				<p className="text-neutral-600">
					A full refund has been issued to your original payment method. A
					confirmation email is on its way.
				</p>
				<Link className="text-brand-700 underline" to="/">
					Return home
				</Link>
			</CenteredMessage>
		);
	}

	if (!query.data.eligible) {
		return (
			<CenteredMessage title="Nothing to cancel">
				<p className="text-neutral-600">
					{REASON_MESSAGE[query.data.reason] ??
						"This reservation isn't eligible for self-service cancellation. Contact us directly for help."}
				</p>
			</CenteredMessage>
		);
	}

	const { checkIn, checkOut, guests, amountTotal } = query.data;

	return (
		<main className="flex min-h-[60vh] w-full items-center justify-center">
			<div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
				<h1 className="text-2xl font-semibold">Cancel your reservation?</h1>
				<div className="w-full max-w-sm rounded-lg border border-neutral-200 p-4 text-left text-sm text-neutral-700">
					<p>
						{dayjs(checkIn).format("MMM D")} – {dayjs(checkOut).format("MMM D, YYYY")}
					</p>
					<p>
						{guests} guest{guests === 1 ? "" : "s"}
					</p>
					<p className="mt-2 font-semibold">{formatCents(amountTotal)} paid</p>
				</div>
				<p className="text-sm text-neutral-500">
					Cancelling issues a full refund to your original payment method.
				</p>
				<Button
					variant="danger"
					onClick={() => {
						setConfirming(true);
					}}
				>
					Cancel my reservation
				</Button>

				{confirming && (
					<ConfirmDialog
						confirmLabel="Cancel & refund"
						error={cancel.error?.message}
						isPending={cancel.isPending}
						message="This will cancel your reservation and issue a full refund. This can't be undone."
						title="Cancel reservation"
						onCancel={() => {
							cancel.reset();
							setConfirming(false);
						}}
						onConfirm={() => {
							cancel.mutate({ reservationId, token });
						}}
					/>
				)}
			</div>
		</main>
	);
};

const CenteredMessage = ({
	title,
	tone = "default",
	children,
}: {
	title: string;
	tone?: "default" | "brand";
	children: ReactNode;
}): FunctionComponent => (
	<main className="flex min-h-[60vh] w-full items-center justify-center">
		<div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
			<h1
				className={`text-2xl font-semibold ${tone === "brand" ? "text-brand-700" : ""}`}
			>
				{title}
			</h1>
			{children}
		</div>
	</main>
);
