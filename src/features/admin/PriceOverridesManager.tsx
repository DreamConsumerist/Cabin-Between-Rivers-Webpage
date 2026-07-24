import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import type { DateSelection } from "../booking/Calendar";
import { toIsoDate } from "../booking/dateUtilities";
import type { PriceOverride } from "./api";
import { PriceOverrideCalendar } from "./PriceOverrideCalendar";
import {
	useCreatePriceOverride,
	useDeletePriceOverride,
	usePriceOverrides,
	useUpdatePriceOverride,
} from "./hooks";
import {
	priceOverrideFormSchema,
	type PriceOverrideFormInput,
	type PriceOverrideFormValues,
} from "./schema";

const centsToDollars = (cents: number): number => Math.round(cents) / 100;
const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

type NewOverrideFormProps = {
	checkIn: Dayjs;
	checkOut: Dayjs;
	onSaved: () => void;
};

const NewOverrideForm = ({ checkIn, checkOut, onSaved }: NewOverrideFormProps): FunctionComponent => {
	const create = useCreatePriceOverride();
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<PriceOverrideFormInput, unknown, PriceOverrideFormValues>({
		resolver: zodResolver(priceOverrideFormSchema),
		defaultValues: { nightlyRate: 0, label: "" },
	});

	return (
		<form
			className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-4"
			onSubmit={handleSubmit((values) => {
				create.mutate(
					{
						checkIn: toIsoDate(checkIn),
						checkOut: toIsoDate(checkOut),
						nightlyRate: dollarsToCents(values.nightlyRate),
						label: values.label ?? "",
					},
					{ onSuccess: onSaved }
				);
			})}
		>
			<p className="w-full text-sm text-neutral-600">
				{checkIn.format("MMM D, YYYY")} – {checkOut.format("MMM D, YYYY")}
			</p>
			<TextField
				label="Nightly rate ($)"
				min={0}
				step="0.01"
				type="number"
				{...register("nightlyRate")}
				error={errors.nightlyRate?.message}
			/>
			<TextField label="Label (optional)" {...register("label")} error={errors.label?.message} />
			<Button disabled={create.isPending} type="submit">
				{create.isPending ? "Saving…" : "Save override"}
			</Button>
			{create.isError && <p className="w-full text-sm text-red-600">{create.error.message}</p>}
		</form>
	);
};

type OverrideRowProps = { override: PriceOverride };

const OverrideRow = ({ override }: OverrideRowProps): FunctionComponent => {
	const update = useUpdatePriceOverride();
	const deleteOverride = useDeletePriceOverride();
	const [rate, setRate] = useState(String(centsToDollars(override.nightlyRate)));
	const [label, setLabel] = useState(override.label ?? "");

	const dirty = rate !== String(centsToDollars(override.nightlyRate)) || label !== (override.label ?? "");

	return (
		<li className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-sm text-neutral-700">
					{dayjs(override.checkIn).format("MMM D, YYYY")} – {dayjs(override.checkOut).format("MMM D, YYYY")}
				</span>
				<input
					className="w-24 rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
					min={0}
					step="0.01"
					type="number"
					value={rate}
					onChange={(event) => { setRate(event.target.value); }}
				/>
				<input
					className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
					placeholder="Label (optional)"
					value={label}
					onChange={(event) => { setLabel(event.target.value); }}
				/>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						className="px-3 py-1.5 text-sm"
						disabled={!dirty || update.isPending || Number.isNaN(Number(rate))}
						type="button"
						variant="secondary"
						onClick={() => {
							update.mutate({
								id: override.id,
								input: {
									checkIn: override.checkIn,
									checkOut: override.checkOut,
									nightlyRate: dollarsToCents(Number(rate)),
									label,
								},
							});
						}}
					>
						Save
					</Button>
					<Button
						className="px-3 py-1.5 text-sm"
						disabled={deleteOverride.isPending}
						type="button"
						variant="secondary"
						onClick={() => {
							if (confirm("Delete this price override?")) deleteOverride.mutate(override.id);
						}}
					>
						Delete
					</Button>
				</div>
			</div>
			{update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
		</li>
	);
};

export const PriceOverridesManager = (): FunctionComponent => {
	const { data, isPending, error } = usePriceOverrides();
	const [selection, setSelection] = useState<DateSelection>({ checkIn: null, checkOut: null });
	const overrides = data?.overrides ?? [];

	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="mb-4 text-sm text-neutral-500">
					Select a date range to set a nightly rate for that range, overriding the default nightly rate.
				</p>
				<PriceOverrideCalendar overrides={overrides} selection={selection} onChange={setSelection} />
			</div>

			{selection.checkIn && selection.checkOut ? (
				<NewOverrideForm
					checkIn={selection.checkIn}
					checkOut={selection.checkOut}
					onSaved={() => { setSelection({ checkIn: null, checkOut: null }); }}
				/>
			) : (
				<p className="text-sm text-neutral-500">
					Select a check-in and check-out date on the calendar to set a price for that range.
				</p>
			)}

			{isPending && <p className="text-neutral-500">Loading price overrides…</p>}
			{error && <p className="text-sm text-red-600">{error.message}</p>}

			{overrides.length > 0 && (
				<ul className="flex flex-col gap-3">
					{overrides.map((override) => (
						<OverrideRow key={override.id} override={override} />
					))}
				</ul>
			)}
		</div>
	);
};
