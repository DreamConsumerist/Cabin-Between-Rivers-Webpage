import { useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import { guestDetailsSchema, type GuestDetails, type GuestDetailsInput } from "./schema";

type BookingFormProps = {
	defaultValues?: Partial<GuestDetailsInput>;
	onChange?: (values: Partial<GuestDetailsInput>) => void;
	onSubmit: (data: GuestDetails) => void;
	submitting: boolean;
	// Rendered between the fields and the submit button — the pricing summary
	// in Booking.tsx's "details" step, so it reflects the guest count as it's
	// being typed without needing its own separate form/state.
	children?: ReactNode;
};

export const BookingForm = ({
	defaultValues,
	onChange,
	onSubmit,
	submitting,
	children,
}: BookingFormProps): FunctionComponent => {
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<GuestDetailsInput, unknown, GuestDetails>({
		resolver: zodResolver(guestDetailsSchema),
		defaultValues: { guests: 1, ...defaultValues },
	});

	// Reports every keystroke up to the parent so it can rehydrate this form's
	// values if the guest navigates away (e.g. back to dates) and returns.
	useEffect(() => {
		// watch() is RHF's documented subscription pattern; the callback only calls
		// a plain setState (see onChange usage in Booking.tsx), so there's no
		// memoization boundary for the compiler's stale-closure concern to bite.
		// eslint-disable-next-line react-hooks/incompatible-library
		const subscription = watch((values): void => {
			onChange?.(values);
		});
		return (): void => {
			subscription.unsubscribe();
		};
	}, [watch, onChange]);

	return (
		<form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
			<TextField
				label="Full name"
				{...register("guestName")}
				error={errors.guestName?.message}
			/>
			<TextField
				label="Email"
				type="email"
				{...register("guestEmail")}
				error={errors.guestEmail?.message}
			/>
			<TextField
				label="Phone"
				type="tel"
				{...register("guestPhone")}
				error={errors.guestPhone?.message}
			/>
			<TextField
				label="Guests"
				max={20}
				min={1}
				type="number"
				{...register("guests")}
				error={errors.guests?.message}
			/>
			{children}
			<Button disabled={submitting} type="submit">
				{submitting ? "Holding your dates…" : "Continue to payment"}
			</Button>
		</form>
	);
};
