import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import type { IcalSyncSummary } from "./api";
import {
	useAdminIcal,
	useRegenerateExportToken,
	useTriggerIcalSync,
	useUpdateAdminIcal,
} from "./hooks";
import {
	icalFormSchema,
	type IcalFormInput,
	type IcalFormValues,
} from "./schema";

const SyncSummary = ({
	summary,
}: {
	summary: IcalSyncSummary;
}): FunctionComponent => (
	<ul className="flex flex-col gap-1 text-sm text-neutral-600">
		{summary.results.map((result) => (
			<li key={result.source}>
				{result.source === "airbnb" ? "Airbnb" : "Vrbo"}:{" "}
				{result.ok
					? `${result.eventCount} event(s), ${result.inserted} new, ${result.updated} updated, ${result.pruned} removed${
							result.conflicts > 0
								? `, ⚠ ${result.conflicts} possible double-booking(s)`
								: ""
						}`
					: `sync failed — ${result.error}`}
			</li>
		))}
	</ul>
);

export const IcalForm = (): FunctionComponent => {
	const { data, isPending: isLoading } = useAdminIcal();
	const update = useUpdateAdminIcal();
	const syncNow = useTriggerIcalSync();
	const regenerate = useRegenerateExportToken();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<IcalFormInput, unknown, IcalFormValues>({
		resolver: zodResolver(icalFormSchema),
	});

	// Populate the form once the current URLs load (they can't be known at
	// first render — the query starts empty).
	useEffect(() => {
		if (data) {
			reset({
				airbnbIcalUrl: data.airbnbIcalUrl,
				vrboIcalUrl: data.vrboIcalUrl,
				notificationEmails: data.notificationEmails,
			});
		}
	}, [data, reset]);

	if (isLoading) {
		return <p className="text-neutral-500">Loading iCal settings…</p>;
	}

	const syncSummary = syncNow.data ?? update.data?.sync ?? null;
	const exportUrl = regenerate.data?.exportUrl ?? data?.exportUrl ?? "";

	return (
		<div className="flex max-w-md flex-col gap-8">
			<form
				className="flex flex-col gap-4"
				onSubmit={handleSubmit((values) => {
					update.mutate({
						airbnbIcalUrl: values.airbnbIcalUrl ?? "",
						vrboIcalUrl: values.vrboIcalUrl ?? "",
						notificationEmails: values.notificationEmails ?? "",
					});
				})}
			>
				<p className="text-sm text-neutral-500">
					Import bookings from Airbnb/Vrbo so those dates block your own
					calendar. Find each URL in that platform&apos;s calendar sync/export
					settings. Calendars sync automatically every 30 minutes, when you save
					below, or on demand with &quot;Sync now&quot;.
				</p>
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
				<TextField
					label="Double-booking warning email(s) (optional)"
					{...register("notificationEmails")}
					error={errors.notificationEmails?.message}
				/>
				<p className="-mt-3 text-sm text-neutral-500">
					Comma-separated. Warns if a synced calendar block or a payment race
					overlaps a booking that&apos;s already confirmed or held.
				</p>
				{update.isError && (
					<p className="text-sm text-red-600">{update.error.message}</p>
				)}
				{update.isSuccess && (
					<p className="text-sm text-green-700">iCal settings saved.</p>
				)}
				<div className="flex gap-2">
					<Button disabled={update.isPending} type="submit">
						{update.isPending ? "Saving…" : "Save iCal settings"}
					</Button>
					<Button
						disabled={syncNow.isPending}
						type="button"
						variant="secondary"
						onClick={() => {
							syncNow.mutate();
						}}
					>
						{syncNow.isPending ? "Syncing…" : "Sync now"}
					</Button>
				</div>
				{syncNow.isError && (
					<p className="text-sm text-red-600">{syncNow.error.message}</p>
				)}
				{syncSummary && <SyncSummary summary={syncSummary} />}
			</form>

			<div className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
				<p className="text-sm text-neutral-500">
					Paste this URL into Airbnb&apos;s and Vrbo&apos;s &quot;import
					calendar&quot; settings so they block dates booked directly on this
					site.
				</p>
				<TextField
					readOnly
					label="Export feed URL"
					value={exportUrl}
					trailing={
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								void navigator.clipboard.writeText(exportUrl);
							}}
						>
							Copy
						</Button>
					}
				/>
				<div>
					<Button
						disabled={regenerate.isPending}
						type="button"
						variant="secondary"
						onClick={() => {
							regenerate.mutate();
						}}
					>
						{regenerate.isPending ? "Regenerating…" : "Regenerate URL"}
					</Button>
				</div>
				{regenerate.isError && (
					<p className="text-sm text-red-600">{regenerate.error.message}</p>
				)}
				<p className="text-xs text-neutral-500">
					Regenerating invalidates the old URL — you&apos;ll need to update it
					on Airbnb/Vrbo too.
				</p>
			</div>
		</div>
	);
};
