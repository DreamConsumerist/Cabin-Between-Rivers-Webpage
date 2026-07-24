import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { useAdminTerms, useUpdateAdminTerms } from "./hooks";
import { termsFormSchema, type TermsFormValues } from "./schema";

export const TermsForm = (): FunctionComponent => {
	const { data, isPending: isLoading } = useAdminTerms();
	const update = useUpdateAdminTerms();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<TermsFormValues>({ resolver: zodResolver(termsFormSchema) });

	// Populate the form once the current (or default) terms load — same
	// pattern as SettingsForm, since the value isn't known at first render.
	useEffect(() => {
		if (data) reset({ termsContent: data.termsContent });
	}, [data, reset]);

	if (isLoading) {
		return <p className="text-neutral-500">Loading terms…</p>;
	}

	return (
		<form
			className="flex max-w-2xl flex-col gap-4"
			onSubmit={handleSubmit((values) => {
				update.mutate(values.termsContent);
			})}
		>
			<p className="text-sm text-neutral-500">
				Shown to guests in the booking flow before payment. Plain text — separate
				paragraphs with a blank line. Start a line with <code>## </code> for a section
				heading (e.g. <code>## Cancellations</code>), or <code>#</code> for the page
				title.
			</p>
			<textarea
				className="min-h-96 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-400"
				{...register("termsContent")}
			/>
			{errors.termsContent && (
				<p className="text-sm text-red-600">{errors.termsContent.message}</p>
			)}
			{update.isError && <p className="text-sm text-red-600">{update.error.message}</p>}
			{update.isSuccess && <p className="text-sm text-green-700">Terms saved.</p>}
			<Button disabled={update.isPending} type="submit">
				{update.isPending ? "Saving…" : "Save terms"}
			</Button>
		</form>
	);
};
