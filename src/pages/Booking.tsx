import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FunctionComponent } from "../common/types";
import { Button } from "../components/ui/Button";
import { BookingForm } from "../features/booking/BookingForm";
import { Calendar, type DateSelection } from "../features/booking/Calendar";
import { CheckoutStep } from "../features/booking/CheckoutStep";
import { DiscountCodeForm } from "../features/booking/DiscountCodeForm";
import { HoldTimer } from "../features/booking/HoldTimer";
import { TermsStep } from "../features/booking/TermsStep";
import {
	cancelReservation,
	type BookingConfigurationOption,
	type CreateBookingResult,
} from "../features/booking/api";
import {
	buildNightlyBreakdown,
	computeEstimatedSubtotalCents,
	estimatedExtraGuestFeeCents,
	formatCents,
	taxCentsFor,
	toIsoDate,
} from "../features/booking/dateUtilities";
import {
	useAvailability,
	useCancelReservation,
	useCreateBooking,
} from "../features/booking/hooks";
import type {
	GuestDetails,
	GuestDetailsInput,
} from "../features/booking/schema";

type Step = "configuration" | "dates" | "details" | "terms" | "payment";

export const Booking = (): FunctionComponent => {
	const queryClient = useQueryClient();
	const [configurationId, setConfigurationId] = useState<number | null>(null);
	const availability = useAvailability(configurationId ?? undefined);
	const createBookingMutation = useCreateBooking();
	const cancelReservationMutation = useCancelReservation();

	const [step, setStep] = useState<Step>("dates");
	const [selection, setSelection] = useState<DateSelection>({
		checkIn: null,
		checkOut: null,
	});
	const [reservation, setReservation] = useState<CreateBookingResult | null>(
		null
	);
	const [notice, setNotice] = useState<string | null>(null);
	const [guestDetails, setGuestDetails] = useState<
		Partial<GuestDetailsInput> | undefined
	>(undefined);
	const [termsAccepted, setTermsAccepted] = useState(false);
	const [idPhotoUploaded, setIdPhotoUploaded] = useState(false);
	const [discountAmount, setDiscountAmount] = useState(0);
	const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);

	const configurationSwitchingEnabled =
		availability.data?.configurationSwitchingEnabled ?? false;
	const configurations: Array<BookingConfigurationOption> =
		availability.data?.configurations ?? [];

	const { checkIn, checkOut } = selection;
	const nights = checkIn && checkOut ? checkOut.diff(checkIn, "day") : 0;
	const pricing = availability.data?.pricing ?? null;
	const belowMinNights = Boolean(
		checkIn && checkOut && pricing && nights < pricing.minNights
	);
	const canContinueFromDates = Boolean(checkIn && checkOut && !belowMinNights);
	const priceOverrides = availability.data?.priceOverrides ?? [];
	const estimatedSubtotal =
		checkIn && checkOut && pricing
			? computeEstimatedSubtotalCents(
					checkIn,
					checkOut,
					pricing,
					priceOverrides
				)
			: 0;
	const estimatedTax = taxCentsFor(estimatedSubtotal);

	// Guest count isn't known until the "details" step, so this recomputes the
	// estimate live as the guest count changes there — the "dates" step summary
	// above deliberately omits the extra-guest surcharge (see
	// estimatedExtraGuestFeeCents's guests=0 default).
	const detailsGuests = Number(guestDetails?.guests) || 0;
	const detailsSubtotal =
		checkIn && checkOut && pricing
			? computeEstimatedSubtotalCents(
					checkIn,
					checkOut,
					pricing,
					priceOverrides,
					detailsGuests
				)
			: 0;
	const detailsExtraGuestFee = pricing
		? estimatedExtraGuestFeeCents(pricing, detailsGuests)
		: 0;
	const detailsTax = taxCentsFor(detailsSubtotal);

	const resetToDates = useCallback(() => {
		setStep("dates");
		setReservation(null);
		setSelection({ checkIn: null, checkOut: null });
		// A fresh reservation needs its own terms acceptance, ID upload, and
		// discount state, not whatever was left over from an abandoned one.
		setTermsAccepted(false);
		setIdPhotoUploaded(false);
		setDiscountAmount(0);
		setAppliedDiscountCode(null);
		void queryClient.invalidateQueries({ queryKey: ["availability"] });
	}, [queryClient]);

	const handleExpire = useCallback(() => {
		setNotice("Your hold expired — please pick your dates again.");
		resetToDates();
	}, [resetToDates]);

	// Stable identity so BookingForm's watch-subscription effect doesn't tear
	// down and resubscribe on every render.
	const handleGuestDetailsChange = useCallback(
		(values: Partial<GuestDetailsInput>) => {
			setGuestDetails(values);
		},
		[]
	);

	// Kept in sync with `reservation`/`step` so the effects below can read the
	// latest values without re-running (and re-firing their cleanup) on every
	// change.
	const reservationIdRef = useRef<number | null>(null);
	useEffect(() => {
		reservationIdRef.current = reservation?.reservationId ?? null;
	}, [reservation]);
	const stepRef = useRef<Step>(step);
	useEffect(() => {
		stepRef.current = step;
	}, [step]);

	// Once we learn switching is enabled (only known after the first
	// availability fetch resolves), send a guest who hasn't picked a
	// configuration yet to that step before they see dates — but only at the
	// very start; a guest who's already moved on shouldn't get yanked back.
	// Adjusting state during render (React's documented alternative to a
	// setState-in-effect) rather than a useEffect, guarded so it only ever
	// fires once, the first render after availability.data resolves.
	const [hasAppliedInitialStep, setHasAppliedInitialStep] = useState(false);
	if (!hasAppliedInitialStep && availability.data) {
		setHasAppliedInitialStep(true);
		if (
			configurationSwitchingEnabled &&
			configurationId == null &&
			step === "dates"
		) {
			setStep("configuration");
		}
	}

	// Releases the hold if the guest navigates away from the booking page
	// entirely (e.g. back to the landing page, or a browser back/forward) while
	// a reservation is still pending. Mirrors the cancellation `goToStep` already
	// does when stepping back to "dates"/"details" in-page — this just covers
	// leaving the page outright, which previously left the hold to expire on its
	// own after HOLD_MINUTES. Fire-and-forget: if the request doesn't land, the
	// hold still self-expires.
	useEffect((): (() => void) => {
		return (): void => {
			const reservationId = reservationIdRef.current;
			if (reservationId != null) {
				void cancelReservation(reservationId);
			}
		};
	}, []);

	// Same release, but for tab close / hard refresh / non-SPA navigation, where
	// the document unloads outright and the unmount effect above never gets a
	// chance to run its fetch to completion. `pagehide` doesn't fire on in-app
	// route changes (the document never unloads), so this never double-fires
	// alongside the effect above — sendBeacon is used since it's guaranteed to
	// be sent even as the page is going away.
	useEffect((): (() => void) => {
		const releaseOnUnload = (): void => {
			const reservationId = reservationIdRef.current;
			if (reservationId == null) return;
			// Stripe's embedded checkout completes with a real top-level navigation
			// to return_url (not an in-app route change), which also fires
			// `pagehide`. Cancelling here would race the webhook that's about to
			// confirm the same reservation — skip it once we've reached "payment"
			// and let the webhook/hold expiry be the source of truth instead.
			if (stepRef.current === "payment") return;
			navigator.sendBeacon(
				"/api/cancel-reservation",
				new Blob([JSON.stringify({ reservationId })], {
					type: "application/json",
				})
			);
		};
		window.addEventListener("pagehide", releaseOnUnload);
		return (): void => {
			window.removeEventListener("pagehide", releaseOnUnload);
		};
	}, []);

	const canGoToDates =
		!configurationSwitchingEnabled || configurationId != null;
	const canGoToDetails = canGoToDates && canContinueFromDates;
	const canGoToTerms = Boolean(reservation);
	const canGoToPayment = canGoToTerms && termsAccepted && idPhotoUploaded;

	// The step tabs at the top are the only way to move between steps. Stepping
	// back to "dates"/"details" from "terms"/"payment" abandons the reservation
	// and releases its hold first (best-effort — even if the cancel call fails,
	// we still navigate; the abandoned hold frees itself once it lapses, so
	// nothing gets stuck either way). Moving between "terms" and "payment" keeps
	// the same hold, so no cancellation is needed there.
	const goToStep = (target: Step): void => {
		if (target === step || cancelReservationMutation.isPending) return;
		if (target === "dates" && !canGoToDates) return;
		if (target === "details" && !canGoToDetails) return;
		if (target === "terms" && !canGoToTerms) return;
		if (target === "payment" && !canGoToPayment) return;

		const abandoningReservation =
			reservation &&
			(step === "terms" || step === "payment") &&
			(target === "dates" || target === "details");

		if (abandoningReservation && reservation) {
			cancelReservationMutation.mutate(reservation.reservationId, {
				onSettled: () => {
					setReservation(null);
					setNotice(null);
					setTermsAccepted(false);
					setIdPhotoUploaded(false);
					setDiscountAmount(0);
					setAppliedDiscountCode(null);
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
				configurationId: configurationId ?? undefined,
				checkIn: toIsoDate(checkIn),
				checkOut: toIsoDate(checkOut),
				guestName: details.guestName,
				guestEmail: details.guestEmail,
				guestPhone: details.guestPhone,
				guests: details.guests,
			},
			{
				onSuccess: (result) => {
					setReservation(result);
					setStep("terms");
				},
				onError: (error) => {
					const message =
						error instanceof Error ? error.message : "Could not create booking";
					setNotice(message);
					if (/taken|unavailable/i.test(message)) {
						resetToDates();
					}
				},
			}
		);
	};

	return (
		<main className="w-full">
			<div className="mx-auto flex max-w-3xl flex-col items-center gap-8 p-8">
				<header className="text-center">
					<h1 className="text-3xl font-semibold tracking-tight">
						Book your stay
					</h1>
				</header>

				<ol className="flex gap-6 text-sm">
					{(
						(configurationSwitchingEnabled
							? [
									{
										target: "configuration",
										label: "1. Configuration",
										enabled: true,
									},
									{ target: "dates", label: "2. Dates", enabled: canGoToDates },
									{
										target: "details",
										label: "3. Details",
										enabled: canGoToDetails,
									},
									{ target: "terms", label: "4. Terms", enabled: canGoToTerms },
									{
										target: "payment",
										label: "5. Payment",
										enabled: canGoToPayment,
									},
								]
							: [
									{ target: "dates", label: "1. Dates", enabled: true },
									{
										target: "details",
										label: "2. Details",
										enabled: canGoToDetails,
									},
									{ target: "terms", label: "3. Terms", enabled: canGoToTerms },
									{
										target: "payment",
										label: "4. Payment",
										enabled: canGoToPayment,
									},
								]) satisfies Array<{
							target: Step;
							label: string;
							enabled: boolean;
						}>
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
								onClick={() => {
									goToStep(target);
								}}
							>
								{label}
							</button>
						</li>
					))}
				</ol>

				{notice && <p className="text-sm text-red-600">{notice}</p>}

				{step === "configuration" && (
					<div className="flex w-full max-w-lg flex-col items-center gap-4">
						{availability.isPending && (
							<p className="text-neutral-500">Loading options…</p>
						)}
						{availability.isError && (
							<p className="text-red-600">
								Could not load booking options. Try refreshing.
							</p>
						)}
						{configurations.length > 0 && (
							<ul className="flex w-full flex-col gap-3">
								{configurations.map((configuration) => (
									<li key={configuration.id}>
										<button
											className="flex w-full flex-col gap-2 rounded-lg border border-neutral-300 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
											type="button"
											onClick={() => {
												setConfigurationId(configuration.id);
												setStep("dates");
											}}
										>
											<span className="font-semibold text-neutral-900">
												{configuration.name}
											</span>
											{configuration.description && (
												<span className="text-sm text-neutral-600">
													{configuration.description}
												</span>
											)}
											<span className="text-sm text-neutral-500">
												{formatCents(configuration.nightlyRate)}/night ·{" "}
												{formatCents(configuration.cleaningFee)} cleaning fee ·
												min {configuration.minNights} night
												{configuration.minNights === 1 ? "" : "s"}
											</span>
											{configuration.extraGuestFee > 0 && (
												<span className="text-xs text-neutral-500">
													+{formatCents(configuration.extraGuestFee)} per guest
													after {configuration.baseOccupancy} guests
												</span>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				{step === "dates" && (
					<div className="flex w-full max-w-sm flex-col items-center gap-4">
						{availability.isPending && (
							<p className="text-neutral-500">Loading availability…</p>
						)}
						{availability.isError && (
							<p className="text-red-600">
								Could not load availability. Try refreshing.
							</p>
						)}
						{availability.data && (
							<Calendar
								blocked={availability.data.blocked}
								priceOverrides={availability.data.priceOverrides}
								pricing={availability.data.pricing}
								selection={selection}
								onChange={setSelection}
							/>
						)}
						{checkIn && checkOut && (
							<p className="text-neutral-700">
								{checkIn.format("MMM D")} – {checkOut.format("MMM D, YYYY")} ·{" "}
								{nights} night
								{nights === 1 ? "" : "s"}
							</p>
						)}
						{belowMinNights && pricing && (
							<p className="text-sm text-red-600">
								Minimum stay is {pricing.minNights} nights.
							</p>
						)}
						{checkIn && checkOut && pricing && !belowMinNights && (
							<div className="w-full rounded-lg border border-neutral-200 p-4 text-sm">
								<ul className="flex flex-col gap-1">
									{buildNightlyBreakdown(
										checkIn,
										checkOut,
										pricing,
										priceOverrides
									).map(({ date, rateCents }) => (
										<li
											key={date.format("YYYY-MM-DD")}
											className="flex justify-between text-neutral-600"
										>
											<span>{date.format("ddd, MMM D")}</span>
											<span>{formatCents(rateCents)}</span>
										</li>
									))}
									<li className="flex justify-between text-neutral-600">
										<span>Cleaning fee</span>
										<span>{formatCents(pricing.cleaningFee)}</span>
									</li>
									<li className="flex justify-between text-neutral-600">
										<span>Tax (3%)</span>
										<span>{formatCents(estimatedTax)}</span>
									</li>
								</ul>
								<div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
									<span>Total</span>
									<span>{formatCents(estimatedSubtotal + estimatedTax)}</span>
								</div>
							</div>
						)}
						<Button
							disabled={!canContinueFromDates}
							onClick={() => {
								goToStep("details");
							}}
						>
							Continue
						</Button>
					</div>
				)}

				{step === "details" && checkIn && checkOut && (
					<div className="flex w-full max-w-sm flex-col items-center gap-4">
						<p className="text-neutral-700">
							{checkIn.format("MMM D")} – {checkOut.format("MMM D, YYYY")} ·{" "}
							{nights} night
							{nights === 1 ? "" : "s"}
						</p>
						<BookingForm
							defaultValues={guestDetails}
							submitting={createBookingMutation.isPending}
							onChange={handleGuestDetailsChange}
							onSubmit={handleGuestSubmit}
						>
							{pricing && (
								<div className="w-full rounded-lg border border-neutral-200 p-4 text-sm">
									<ul className="flex flex-col gap-1">
										{buildNightlyBreakdown(
											checkIn,
											checkOut,
											pricing,
											priceOverrides,
											detailsExtraGuestFee
										).map(({ date, rateCents }) => (
											<li
												key={date.format("YYYY-MM-DD")}
												className="flex justify-between text-neutral-600"
											>
												<span>{date.format("ddd, MMM D")}</span>
												<span>{formatCents(rateCents)}</span>
											</li>
										))}
										<li className="flex justify-between text-neutral-600">
											<span>Cleaning fee</span>
											<span>{formatCents(pricing.cleaningFee)}</span>
										</li>
										<li className="flex justify-between text-neutral-600">
											<span>Tax (3%)</span>
											<span>{formatCents(detailsTax)}</span>
										</li>
									</ul>
									<div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
										<span>Total</span>
										<span>{formatCents(detailsSubtotal + detailsTax)}</span>
									</div>
								</div>
							)}
						</BookingForm>
					</div>
				)}

				{step === "terms" && reservation && (
					<div className="flex w-full flex-col items-center gap-4">
						<HoldTimer
							holdExpiresAt={reservation.holdExpiresAt}
							onExpire={handleExpire}
						/>
						<TermsStep
							accepted={termsAccepted}
							idPhotoUploaded={idPhotoUploaded}
							reservationId={reservation.reservationId}
							onAcceptedChange={setTermsAccepted}
							onIdPhotoUploadedChange={setIdPhotoUploaded}
						/>
						<Button
							disabled={!termsAccepted || !idPhotoUploaded}
							onClick={() => {
								goToStep("payment");
							}}
						>
							Continue to payment
						</Button>
					</div>
				)}

				{step === "payment" && reservation && (
					<div className="flex w-full flex-col items-center gap-4">
						<HoldTimer
							holdExpiresAt={reservation.holdExpiresAt}
							onExpire={handleExpire}
						/>
						{checkIn && checkOut && pricing && (
							<div className="w-full max-w-sm rounded-lg border border-neutral-200 p-4 text-sm">
								<ul className="flex flex-col gap-1">
									{buildNightlyBreakdown(
										checkIn,
										checkOut,
										pricing,
										priceOverrides,
										detailsExtraGuestFee
									).map(({ date, rateCents }) => (
										<li
											key={date.format("YYYY-MM-DD")}
											className="flex justify-between text-neutral-600"
										>
											<span>{date.format("ddd, MMM D")}</span>
											<span>{formatCents(rateCents)}</span>
										</li>
									))}
									<li className="flex justify-between text-neutral-600">
										<span>Cleaning fee</span>
										<span>{formatCents(pricing.cleaningFee)}</span>
									</li>
									<li className="flex justify-between text-neutral-600">
										<span>Tax (3%)</span>
										<span>{formatCents(detailsTax)}</span>
									</li>
									{discountAmount > 0 && (
										<li className="flex justify-between text-green-700">
											<span>
												Discount{appliedDiscountCode ? ` (${appliedDiscountCode})` : ""}
											</span>
											<span>−{formatCents(discountAmount)}</span>
										</li>
									)}
								</ul>
								<div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
									<span>Total</span>
									<span>{formatCents(reservation.amountTotal)}</span>
								</div>
							</div>
						)}
						<DiscountCodeForm
							reservationId={reservation.reservationId}
							onChange={(result) => {
								setDiscountAmount(result.discountAmount);
								setAppliedDiscountCode(result.code);
								setReservation({ ...reservation, amountTotal: result.amountTotal });
							}}
						/>
						{/* Keyed on amountTotal: a Stripe Checkout Session is priced once at
						creation, so applying/removing a discount code (which changes the
						amount) needs a fresh mount to pick up the new total — see
						CheckoutStep's cleanup effect and create-payment.mts's idempotency key. */}
						<CheckoutStep
							key={reservation.amountTotal}
							reservationId={reservation.reservationId}
						/>
						{cancelReservationMutation.isPending && (
							<p className="text-sm text-neutral-500">Going back…</p>
						)}
					</div>
				)}
			</div>
		</main>
	);
};
