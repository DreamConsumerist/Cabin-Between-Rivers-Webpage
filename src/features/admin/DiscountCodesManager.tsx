import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { TextField } from "../../components/forms/TextField";
import type { DiscountCode } from "./api";
import { useCreateDiscountCode, useDeleteDiscountCode, useDiscountCodes } from "./hooks";
import {
	discountCodeFormSchema,
	type DiscountCodeFormInput,
	type DiscountCodeFormValues,
} from "./schema";

const centsToDollars = (cents: number): number => Math.round(cents) / 100;
const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

const formatDiscount = (code: DiscountCode): string =>
	code.discountType === "percent"
		? `${code.discountValue}% off`
		: `$${centsToDollars(code.discountValue).toFixed(2)} off`;

const NewDiscountCodeForm = (): FunctionComponent => {
	const create = useCreateDiscountCode();
	const {
		register,
		handleSubmit,
		watch,
		reset,
		formState: { errors },
	} = useForm<DiscountCodeFormInput, unknown, DiscountCodeFormValues>({
		resolver: zodResolver(discountCodeFormSchema),
		defaultValues: { code: "", discountType: "percent", discountValue: 10 },
	});
	// eslint-disable-next-line react-hooks/incompatible-library
	const discountType = watch("discountType");

	return (
		<form
			className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-4"
			onSubmit={handleSubmit((values) => {
				create.mutate(
					{
						code: values.code,
						discountType: values.discountType,
						discountValue:
							values.discountType === "flat"
								? dollarsToCents(values.discountValue)
								: values.discountValue,
					},
					{
						onSuccess: () => {
							reset({ code: "", discountType: "percent", discountValue: 10 });
						},
					}
				);
			})}
		>
			<TextField
				label="Code"
				placeholder="SUMMER10"
				{...register("code")}
				error={errors.code?.message}
			/>
			<label className="flex flex-col gap-1 text-left">
				<span className="text-sm font-medium text-neutral-700">Type</span>
				<select
					className="rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
					{...register("discountType")}
				>
					<option value="percent">Percent off</option>
					<option value="flat">Flat amount off</option>
				</select>
			</label>
			<TextField
				label={discountType === "flat" ? "Amount off ($)" : "Percent off"}
				min={0}
				step={discountType === "flat" ? "0.01" : "1"}
				type="number"
				{...register("discountValue")}
				error={errors.discountValue?.message}
			/>
			<Button disabled={create.isPending} type="submit">
				{create.isPending ? "Saving…" : "Add code"}
			</Button>
			{create.isError && (
				<p className="w-full text-sm text-red-600">{create.error.message}</p>
			)}
		</form>
	);
};

type DiscountCodeRowProps = { discountCode: DiscountCode };

const DiscountCodeRow = ({ discountCode }: DiscountCodeRowProps): FunctionComponent => {
	const deleteDiscountCode = useDeleteDiscountCode();
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	return (
		<>
			<li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4">
				<div>
					<p className="font-medium text-neutral-800">{discountCode.code}</p>
					<p className="text-sm text-neutral-500">{formatDiscount(discountCode)}</p>
				</div>
				<Button
					className="px-3 py-1.5 text-sm"
					type="button"
					variant="secondary"
					onClick={() => {
						setConfirmingDelete(true);
					}}
				>
					Delete
				</Button>
			</li>
			{confirmingDelete && (
				<ConfirmDialog
					confirmLabel="Delete"
					error={deleteDiscountCode.error?.message}
					isPending={deleteDiscountCode.isPending}
					message={`Delete the code "${discountCode.code}"? This can't be undone.`}
					title="Delete discount code"
					onCancel={() => {
						deleteDiscountCode.reset();
						setConfirmingDelete(false);
					}}
					onConfirm={() => {
						deleteDiscountCode.mutate(discountCode.id, {
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

export const DiscountCodesManager = (): FunctionComponent => {
	const { data, isPending, error } = useDiscountCodes();
	const discountCodes = data?.discountCodes ?? [];

	return (
		<div className="flex flex-col gap-6">
			<NewDiscountCodeForm />

			{isPending && <p className="text-neutral-500">Loading discount codes…</p>}
			{error && <p className="text-sm text-red-600">{error.message}</p>}

			{discountCodes.length > 0 && (
				<ul className="flex flex-col gap-3">
					{discountCodes.map((discountCode) => (
						<DiscountCodeRow key={discountCode.id} discountCode={discountCode} />
					))}
				</ul>
			)}
		</div>
	);
};
