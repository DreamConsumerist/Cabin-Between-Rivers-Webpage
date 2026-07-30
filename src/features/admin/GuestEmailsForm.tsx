import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { useAdminGuestEmails, useUpdateAdminGuestEmails } from "./hooks";
import {
	guestEmailsFormSchema,
	type GuestEmailsFormInput,
	type GuestEmailsFormValues,
} from "./schema";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const formatHour = (hour: number): string => {
	const period = hour < 12 ? "AM" : "PM";
	const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
	return `${twelveHour}:00 ${period}`;
};

export const GuestEmailsForm = (): FunctionComponent => {
	const { data, isPending: isLoading } = useAdminGuestEmails();
	const update = useUpdateAdminGuestEmails();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<GuestEmailsFormInput, unknown, GuestEmailsFormValues>({
		resolver: zodResolver(guestEmailsFormSchema),
	});

	// Populate the form once the current (or default) settings load — same
	// pattern as TermsForm, since the values aren't known at first render.
	useEffect(() => {
		if (data) reset(data);
	}, [data, reset]);

	if (isLoading) {
		return <p className="text-neutral-500">Loading guest email settings…</p>;
	}

	return (
		<form
			className="flex max-w-2xl flex-col gap-6"
			onSubmit={handleSubmit((values) => {
				update.mutate(values);
			})}
		>
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-neutral-700" htmlFor="checkInInstructions">
					Check-in reminder
				</label>
				<p className="text-sm text-neutral-500">
					Sent automatically 2 days before check-in — arrival details (door code, wifi,
					directions).
				</p>
				<textarea
					className="min-h-40 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-400"
					id="checkInInstructions"
					{...register("checkInInstructions")}
				/>
				{errors.checkInInstructions && (
					<p className="text-sm text-red-600">{errors.checkInInstructions.message}</p>
				)}
				<div className="flex items-center gap-2">
					<label className="text-sm text-neutral-700" htmlFor="checkInReminderHour">
						Send at
					</label>
					<select
						className="rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-400"
						id="checkInReminderHour"
						{...register("checkInReminderHour")}
					>
						{HOURS.map((hour) => (
							<option key={hour} value={hour}>
								{formatHour(hour)}
							</option>
						))}
					</select>
					<span className="text-sm text-neutral-500">AKST</span>
				</div>
				{errors.checkInReminderHour && (
					<p className="text-sm text-red-600">{errors.checkInReminderHour.message}</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-neutral-700" htmlFor="checkOutInstructions">
					Check-out reminder
				</label>
				<p className="text-sm text-neutral-500">
					Sent automatically the morning of check-out — checkout time and house-closing steps.
				</p>
				<textarea
					className="min-h-40 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-400"
					id="checkOutInstructions"
					{...register("checkOutInstructions")}
				/>
				{errors.checkOutInstructions && (
					<p className="text-sm text-red-600">{errors.checkOutInstructions.message}</p>
				)}
				<div className="flex items-center gap-2">
					<label className="text-sm text-neutral-700" htmlFor="checkOutReminderHour">
						Send at
					</label>
					<select
						className="rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-400"
						id="checkOutReminderHour"
						{...register("checkOutReminderHour")}
					>
						{HOURS.map((hour) => (
							<option key={hour} value={hour}>
								{formatHour(hour)}
							</option>
						))}
					</select>
					<span className="text-sm text-neutral-500">AKST</span>
				</div>
				{errors.checkOutReminderHour && (
					<p className="text-sm text-red-600">{errors.checkOutReminderHour.message}</p>
				)}
			</div>

			{update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
			{update.isSuccess && <p className="text-sm text-green-700">Guest email settings saved.</p>}
			<Button disabled={update.isPending} type="submit">
				{update.isPending ? "Saving…" : "Save guest emails"}
			</Button>
		</form>
	);
};
