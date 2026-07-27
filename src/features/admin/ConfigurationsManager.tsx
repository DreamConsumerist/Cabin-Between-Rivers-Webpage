import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DropdownMenu } from "../../components/ui/DropdownMenu";
import { Modal } from "../../components/ui/Modal";
import { TextField } from "../../components/forms/TextField";
import type { BookingConfiguration } from "./api";
import { PriceOverridesManager } from "./PriceOverridesManager";
import {
	useAdminSettings,
	useBookingConfigurations,
	useCreateBookingConfiguration,
	useDeleteBookingConfiguration,
	useUpdateAdminSettings,
	useUpdateBookingConfiguration,
} from "./hooks";
import {
	configurationFormSchema,
	type ConfigurationFormInput,
	type ConfigurationFormValues,
} from "./schema";

const centsToDollars = (cents: number): number => Math.round(cents) / 100;
const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

// Toggles whether the booking flow shows a "pick your configuration" step
// before dates (settings.configurationSwitchingEnabled) — when off, booking
// silently uses whichever configuration is marked default below.
const SwitchingToggle = (): FunctionComponent => {
	const { data, isPending } = useAdminSettings();
	const update = useUpdateAdminSettings();
	const enabled = data?.settings?.configurationSwitchingEnabled ?? false;

	return (
		<label className="flex items-center gap-2 text-sm text-neutral-700">
			<input
				checked={enabled}
				disabled={isPending || update.isPending}
				type="checkbox"
				onChange={(event) => {
					update.mutate({
						configurationSwitchingEnabled: event.target.checked,
					});
				}}
			/>
			Let guests choose a configuration before booking
			{update.isError && (
				<span className="text-red-600">{update.error.message}</span>
			)}
		</label>
	);
};

type ConfigurationFormProps = {
	configuration?: BookingConfiguration;
	onSaved: () => void;
	onCancel?: () => void;
};

const ConfigurationForm = ({
	configuration,
	onSaved,
	onCancel,
}: ConfigurationFormProps): FunctionComponent => {
	const create = useCreateBookingConfiguration();
	const update = useUpdateBookingConfiguration();
	const isPending = create.isPending || update.isPending;
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<ConfigurationFormInput, unknown, ConfigurationFormValues>({
		resolver: zodResolver(configurationFormSchema),
		defaultValues: configuration
			? {
					name: configuration.name,
					description: configuration.description ?? "",
					nightlyRate: centsToDollars(configuration.nightlyRate),
					cleaningFee: centsToDollars(configuration.cleaningFee),
					minNights: configuration.minNights,
					baseOccupancy: configuration.baseOccupancy,
					extraGuestFee: centsToDollars(configuration.extraGuestFee),
				}
			: {
					name: "",
					description: "",
					nightlyRate: 0,
					cleaningFee: 0,
					minNights: 1,
					baseOccupancy: 4,
					extraGuestFee: 0,
				},
	});

	return (
		<form
			className="flex max-w-md flex-col gap-4 rounded-xl border border-neutral-200 p-4"
			onSubmit={handleSubmit((values) => {
				const input = {
					name: values.name,
					description: values.description ?? "",
					nightlyRate: dollarsToCents(values.nightlyRate),
					cleaningFee: dollarsToCents(values.cleaningFee),
					minNights: values.minNights,
					baseOccupancy: values.baseOccupancy,
					extraGuestFee: dollarsToCents(values.extraGuestFee),
					isDefault: configuration?.isDefault ?? false,
				};
				if (configuration) {
					update.mutate(
						{ id: configuration.id, input },
						{ onSuccess: onSaved }
					);
				} else {
					create.mutate(input, { onSuccess: onSaved });
				}
			})}
		>
			<TextField
				label="Name"
				{...register("name")}
				error={errors.name?.message}
			/>
			<label className="flex flex-col gap-1 text-left">
				<span className="text-sm font-medium text-neutral-700">
					Guest-facing description (optional)
				</span>
				<textarea
					className="min-h-20 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400"
					{...register("description")}
				/>
				{errors.description && (
					<span className="text-sm text-red-600">
						{errors.description.message}
					</span>
				)}
			</label>
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
				label="Guests included before extra fee"
				min={1}
				type="number"
				{...register("baseOccupancy")}
				error={errors.baseOccupancy?.message}
			/>
			<TextField
				label="Extra guest fee ($ per guest)"
				min={0}
				step="0.01"
				type="number"
				{...register("extraGuestFee")}
				error={errors.extraGuestFee?.message}
			/>
			{(create.isError || update.isError) && (
				<p className="text-sm text-red-600">
					{(create.error ?? update.error)?.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button disabled={isPending} type="submit">
					{isPending ? "Saving…" : "Save"}
				</Button>
				{onCancel && (
					<Button type="button" variant="secondary" onClick={onCancel}>
						Cancel
					</Button>
				)}
			</div>
		</form>
	);
};

type ConfigurationRowProps = { configuration: BookingConfiguration };

const ConfigurationRow = ({
	configuration,
}: ConfigurationRowProps): FunctionComponent => {
	const update = useUpdateBookingConfiguration();
	const deleteConfiguration = useDeleteBookingConfiguration();
	const [editing, setEditing] = useState(false);
	const [showOverrides, setShowOverrides] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	if (editing) {
		return (
			<ConfigurationForm
				configuration={configuration}
				onCancel={() => {
					setEditing(false);
				}}
				onSaved={() => {
					setEditing(false);
				}}
			/>
		);
	}

	return (
		<>
			<li className="flex flex-col flex-wrap gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<p className="font-medium text-neutral-800">
						{configuration.name}
						{configuration.isDefault && (
							<span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
								Default
							</span>
						)}
					</p>
					<p className="text-sm text-neutral-500">
						{centsToDollars(configuration.nightlyRate).toFixed(2)}/night ·{" "}
						{centsToDollars(configuration.cleaningFee).toFixed(2)} cleaning fee
						· min {configuration.minNights} night
						{configuration.minNights === 1 ? "" : "s"}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						className="px-3 py-1.5 text-sm"
						type="button"
						variant="secondary"
						onClick={() => {
							setShowOverrides(true);
						}}
					>
						Seasonal pricing
					</Button>
					<Button
						className="px-3 py-1.5 text-sm"
						type="button"
						variant="secondary"
						onClick={() => {
							setEditing(true);
						}}
					>
						Edit
					</Button>
					{configuration.isDefault ? (
						// Invisible placeholder matching the "⋮" trigger button's box
						// size, so this row's buttons still line up with rows that do
						// have the menu (the default configuration can't be made
						// default again or deleted, so there's nothing to put in it).
						<span
							aria-hidden="true"
							className="px-2 py-1 text-lg leading-none opacity-0"
						>
							⋮
						</span>
					) : (
						<DropdownMenu label="Configuration actions">
							<button
								className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
								disabled={update.isPending}
								type="button"
								onClick={() => {
									update.mutate({
										id: configuration.id,
										input: {
											name: configuration.name,
											description: configuration.description ?? "",
											nightlyRate: configuration.nightlyRate,
											cleaningFee: configuration.cleaningFee,
											minNights: configuration.minNights,
											baseOccupancy: configuration.baseOccupancy,
											extraGuestFee: configuration.extraGuestFee,
											isDefault: true,
										},
									});
								}}
							>
								Make default
							</button>
							<button
								className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-neutral-50"
								type="button"
								onClick={() => {
									setConfirmingDelete(true);
								}}
							>
								Delete
							</button>
						</DropdownMenu>
					)}
				</div>
			</li>
			{showOverrides && (
				<Modal
					title={`Seasonal pricing — ${configuration.name}`}
					onClose={() => {
						setShowOverrides(false);
					}}
				>
					<PriceOverridesManager configurationId={configuration.id} />
				</Modal>
			)}
			{confirmingDelete && (
				<ConfirmDialog
					confirmLabel="Delete"
					error={deleteConfiguration.error?.message}
					isPending={deleteConfiguration.isPending}
					message={`Delete "${configuration.name}"? This can't be undone.`}
					title="Delete configuration"
					onCancel={() => {
						deleteConfiguration.reset();
						setConfirmingDelete(false);
					}}
					onConfirm={() => {
						deleteConfiguration.mutate(configuration.id, {
							onSuccess: () => {
								setConfirmingDelete(false);
							},
						});
					}}
				/>
			)}
		</>
	);
};

export const ConfigurationsManager = (): FunctionComponent => {
	const { data, isPending, error } = useBookingConfigurations();
	const [showNewForm, setShowNewForm] = useState(false);
	const configurations = data?.configurations ?? [];

	return (
		<div className="flex flex-col gap-6">
			<SwitchingToggle />

			{isPending && <p className="text-neutral-500">Loading configurations…</p>}
			{error && <p className="text-sm text-red-600">{error.message}</p>}

			{configurations.length > 0 && (
				<ul className="flex flex-col gap-3">
					{configurations.map((configuration) => (
						<ConfigurationRow
							key={configuration.id}
							configuration={configuration}
						/>
					))}
				</ul>
			)}

			{showNewForm ? (
				<ConfigurationForm
					onCancel={() => {
						setShowNewForm(false);
					}}
					onSaved={() => {
						setShowNewForm(false);
					}}
				/>
			) : (
				<Button
					type="button"
					variant="secondary"
					onClick={() => {
						setShowNewForm(true);
					}}
				>
					Add configuration
				</Button>
			)}
		</div>
	);
};
