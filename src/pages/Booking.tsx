import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FunctionComponent } from "../common/types";
import { Button } from "../components/ui/Button";
import { BookingForm } from "../features/booking/BookingForm";
import { Calendar, type DateSelection } from "../features/booking/Calendar";
import { CheckoutStep } from "../features/booking/CheckoutStep";
import { HoldTimer } from "../features/booking/HoldTimer";
import { TermsStep } from "../features/booking/TermsStep";
import type { CreateBookingResult } from "../features/booking/api";
import {
	computeEstimatedTotalCents,
	formatCents,
	toIsoDate,
} from "../features/booking/dateUtilities";
import { useAvailability, useCancelReservation, useCreateBooking } from "../features/booking/hooks";
import type { GuestDetails, GuestDetailsInput } from "../features/booking/schema";

type Step = "dates" | "details" | "terms" | "payment";

export const Booking = (): FunctionComponent => {
	const queryClient = useQueryClient();
	const availability = useAvailability();
	const createBookingMutation = useCreateBooking();
	const cancelReservationMutation = useCancelReservation();

	const [step, setStep] = useState<Step>("dates");
	const [selection, setSelection] = useState<DateSelection>({ checkIn: null, checkOut: null });
	const [reservation, setReservation] = useState<CreateBookingResult | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [guestDetails, setGuestDetails] = useState<Partial<GuestDetailsInput> | undefined>(
		undefined
	);
	const [termsAccepted, setTermsAccepted] = useState(false);

	const { checkIn, checkOut } = selection;
	const nights = checkIn && checkOut ? checkOut.diff(checkIn, "day") : 0;
	const pricing = availability.data?.pricing ?? null;
	const belowMinNights = Boolean(checkIn && checkOut && pricing && nights < pricing.minNights);
	const canContinueFromDates = Boolean(checkIn && checkOut && !belowMinNights);

	const resetToDates = useCallback(() => {
		setStep("dates");
		setReservation(null);
		setSelection({ checkIn: null, checkOut: null });
		void queryClient.invalidateQueries({ queryKey: ["availability"] });
	}, [queryClient]);

	const handleExpire = useCallback(() => {
		setNotice("Your hold expired — please pick your dates again.");
		resetToDates();
	}, [resetToDates]);

	// Stable identity so BookingForm's watch-subscription effect doesn't tear
	// down and resubscribe on every render.
	const handleGuestDetailsChange = useCallback((values: Partial<GuestDetailsInput>) => {
		setGuestDetails(values);
	}, []);

	const canGoToDetails = canContinueFromDates;
	const canGoToTerms = Boolean(reservation);
	const canGoToPayment = canGoToTerms && termsAccepted;

	// The step tabs at the top are the only way to move between steps. Stepping
	// back to "dates"/"details" from "terms"/"payment" abandons the reservation
	// and releases its hold first (best-effort — even if the cancel call fails,
	// we still navigate; the abandoned hold frees itself once it lapses, so
	// nothing gets stuck either way). Moving between "terms" and "payment" keeps
	// the same hold, so no cancellation is needed there.
	const goToStep = (target: Step): void => {
		if (target === step || cancelReservationMutation.isPending) return;
		if (target === "details" && !canGoToDetails) return;
		if (target === "terms" && !canGoToTerms) return;
		if (target === "payment" && !canGoToPayment) return;

		const abandoningReservation =
			reservation && (step === "terms" || step === "payment") && (target === "dates" || target === "details");

		if (abandoningReservation && reservation) {
			cancelReservationMutation.mutate(reservation.reservationId, {
				onSettled: () => {
					setReservation(null);
					setNotice(null);
					setStep(target);
					void queryClient.invalidateQueries({ queryKey: ["availability"] });
				},
			});
			return;
		}
		setNotice(null);
		setStep(target);
	};

	const handleGuestSubmit = (details: GuestDetails): void => {
		if (!checkIn || !checkOut) return;
		setNotice(null);
		createBookingMutation.mutate(
			{
				checkIn: toIsoDate(checkIn),
				checkOut: toIsoDate(checkOut),
				guestName: details.guestName,
				guestEmail: details.guestEmail,
				guestPhone: details.guestPhone || undefined,
				guests: details.guests,
			},
			{
				onSuccess: (result) => {
					setReservation(result);
					setStep("terms");
				},
				onError: (error) => {
					const message = error instanceof Error ? error.message : "Could not create booking";
					setNotice(message);
					if (/taken|unavailable/i.test(message)) {
						resetToDates();
					}
				},
			}
		);
	};

	return (
		<main className="mx-auto flex max-w-3xl flex-col items-center gap-8 p-8">
			<header className="text-center">
				<h1 className="text-3xl font-semibold tracking-tight">Book your stay</h1>
			</header>

			<ol className="flex gap-6 text-sm">
				{(
					[
						{ target: "dates", label: "1. Dates", enabled: true },
						{ target: "details", label: "2. Details", enabled: canGoToDetails },
						{ target: "terms", label: "3. Terms", enabled: canGoToTerms },
						{ target: "payment", label: "4. Payment", enabled: canGoToPayment },
					] as const
				).map(({ target, label, enabled }) => (
					<li key={target}>
						<button
							disabled={!enabled}
							type="button"
							className={
								step === target
									? "font-semibold text-brand-700"
									: enabled
										? "text-neutral-400 transition-colors hover:text-brand-600"
										: "cursor-not-allowed text-neutral-300"
							}
							onClick={() => { goToStep(target); }}
						>
							{label}
						</button>
					</li>
				))}
			</ol>

			{notice && <p className="text-sm text-red-600">{notice}</p>}

			{step === "dates" && (
				<div className="flex w-full max-w-sm flex-col items-center gap-4">
					{availability.isPending && <p className="text-neutral-500">Loading availability…</p>}
					{availability.isError && (
						<p className="text-red-600">Could not load availability. Try refreshing.</p>
					)}
					{availability.data && (
						<Calendar
							blocked={availability.data.blocked}
							selection={selection}
							onChange={setSelection}
						/>
					)}
					{checkIn && checkOut && (
						<p className="text-neutral-700">
							{checkIn.format("MMM D")} – {checkOut.format("MMM D, YYYY")} · {nights} night
							{nights === 1 ? "" : "s"}
							{pricing && !belowMinNights && (
								<> · est. {formatCents(computeEstimatedTotalCents(nights, pricing))}</>
							)}
						</p>
					)}
					{belowMinNights && pricing && (
						<p className="text-sm text-red-600">Minimum stay is {pricing.minNights} nights.</p>
					)}
					<Button disabled={!canContinueFromDates} onClick={() => { goToStep("details"); }}>
						Continue
					</Button>
				</div>
			)}

			{step === "details" && checkIn && checkOut && (
				<div className="flex w-full max-w-sm flex-col items-center gap-4">
					<p className="text-neutral-700">
						{checkIn.format("MMM D")} – {checkOut.format("MMM D, YYYY")} · {nights} night
						{nights === 1 ? "" : "s"}
					</p>
					<BookingForm
						defaultValues={guestDetails}
						submitting={createBookingMutation.isPending}
						onChange={handleGuestDetailsChange}
						onSubmit={handleGuestSubmit}
					/>
				</div>
			)}

			{step === "terms" && reservation && (
				<div className="flex w-full flex-col items-center gap-4">
					<HoldTimer holdExpiresAt={reservation.holdExpiresAt} onExpire={handleExpire} />
					<TermsStep accepted={termsAccepted} onAcceptedChange={setTermsAccepted} />
					<Button disabled={!termsAccepted} onClick={() => { goToStep("payment"); }}>
						Continue to payment
					</Button>
				</div>
			)}

			{step === "payment" && reservation && (
				<div className="flex w-full flex-col items-center gap-4">
					<HoldTimer holdExpiresAt={reservation.holdExpiresAt} onExpire={handleExpire} />
					<p className="text-neutral-700">Total: {formatCents(reservation.amountTotal)}</p>
					<CheckoutStep reservationId={reservation.reservationId} />
					{cancelReservationMutation.isPending && (
						<p className="text-sm text-neutral-500">Going back…</p>
					)}
				</div>
			)}
		</main>
	);
};
