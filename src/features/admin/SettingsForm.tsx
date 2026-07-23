import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import { useAdminSettings, useUpdateAdminSettings } from "./hooks";
import { settingsFormSchema, type SettingsFormInput, type SettingsFormValues } from "./schema";

const centsToDollars = (cents: number): number => Math.round(cents) / 100;
const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

export const SettingsForm = (): FunctionComponent => {
	const { data, isPending: isLoading } = useAdminSettings();
	const update = useUpdateAdminSettings();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<SettingsFormInput, unknown, SettingsFormValues>({
		resolver: zodResolver(settingsFormSchema),
	});

	// Populate the form once the current settings load (they can't be known
	// at first render — the query starts empty).
	useEffect(() => {
		const settings = data?.settings;
		if (!settings) return;
		reset({
			nightlyRate: centsToDollars(settings.nightlyRate),
			cleaningFee: centsToDollars(settings.cleaningFee),
			minNights: settings.minNights,
			airbnbIcalUrl: settings.airbnbIcalUrl ?? "",
			vrboIcalUrl: settings.vrboIcalUrl ?? "",
		});
	}, [data, reset]);

	if (isLoading) {
		return <p className="text-neutral-500">Loading settings…</p>;
	}

	return (
		<form
			className="flex max-w-md flex-col gap-4"
			onSubmit={handleSubmit((values) => {
				update.mutate({
					nightlyRate: dollarsToCents(values.nightlyRate),
					cleaningFee: dollarsToCents(values.cleaningFee),
					minNights: values.minNights,
					airbnbIcalUrl: values.airbnbIcalUrl ?? "",
					vrboIcalUrl: values.vrboIcalUrl ?? "",
				});
			})}
		>
			<TextField
				label="Nightly rate ($)"
				min={0}
				step="0.01"
				type="number"
				{...register("nightlyRate")}
				error={errors.nightlyRate?.message}
			/>
			<TextField
				label="Cleaning fee ($)"
				min={0}
				step="0.01"
				type="number"
				{...register("cleaningFee")}
				error={errors.cleaningFee?.message}
			/>
			<TextField
				label="Minimum nights"
				min={1}
				type="number"
				{...register("minNights")}
				error={errors.minNights?.message}
			/>
			<TextField
				label="Airbnb iCal URL (optional)"
				type="url"
				{...register("airbnbIcalUrl")}
				error={errors.airbnbIcalUrl?.message}
			/>
			<TextField
				label="Vrbo iCal URL (optional)"
				type="url"
				{...register("vrboIcalUrl")}
				error={errors.vrboIcalUrl?.message}
			/>
			{update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
			{update.isSuccess && <p className="text-sm text-green-700">Settings saved.</p>}
			<Button disabled={update.isPending} type="submit">
				{update.isPending ? "Saving…" : "Save settings"}
			</Button>
		</form>
	);
};
