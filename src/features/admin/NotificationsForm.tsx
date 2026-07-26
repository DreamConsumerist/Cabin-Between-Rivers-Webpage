import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import { useAdminNotifications, useUpdateAdminNotifications } from "./hooks";
import {
	notificationsFormSchema,
	type NotificationsFormInput,
	type NotificationsFormValues,
} from "./schema";

export const NotificationsForm = (): FunctionComponent => {
	const { data, isPending: isLoading } = useAdminNotifications();
	const update = useUpdateAdminNotifications();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<NotificationsFormInput, unknown, NotificationsFormValues>({
		resolver: zodResolver(notificationsFormSchema),
	});

	// Populate the form once the current recipient lists load (they can't be
	// known at first render — the query starts empty).
	useEffect(() => {
		if (data) {
			reset({ notificationEmails: data.notificationEmails });
		}
	}, [data, reset]);

	if (isLoading) {
		return <p className="text-neutral-500">Loading notification settings…</p>;
	}

	return (
		<form
			className="flex max-w-md flex-col gap-4"
			onSubmit={handleSubmit((values) => {
				update.mutate({ notificationEmails: values.notificationEmails ?? "" });
			})}
		>
			<p className="text-sm text-neutral-500">
				Sent to these addresses when a booking is confirmed on the site, and
				when a synced calendar block or a payment race overlaps a booking
				that&apos;s already confirmed or held.
			</p>
			<TextField
				label="Notification email(s)"
				{...register("notificationEmails")}
				error={errors.notificationEmails?.message}
			/>
			<p className="-mt-3 text-sm text-neutral-500">Comma-separated.</p>

			{update.isError && (
				<p className="text-sm text-red-600">{update.error.message}</p>
			)}
			{update.isSuccess && (
				<p className="text-sm text-green-700">Notification settings saved.</p>
			)}
			<Button disabled={update.isPending} type="submit">
				{update.isPending ? "Saving…" : "Save notification settings"}
			</Button>
		</form>
	);
};
