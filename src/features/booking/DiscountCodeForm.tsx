import { useState } from "react";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { useApplyDiscountCode } from "./hooks";
import type { ApplyDiscountCodeResult } from "./api";

type DiscountCodeFormProps = {
	reservationId: number;
	onChange: (result: ApplyDiscountCodeResult) => void;
};

// Sits in the payment step (Booking.tsx) above CheckoutStep's embedded Stripe
// form. Just the entry field + Apply — once applied, the discount itself is
// shown in the pricing summary above this, not repeated here (and there's no
// "Remove" here either: a refresh clears an applied code just as well, since
// nothing about it needs undoing mid-flow). Applying a code updates the
// reservation's amountTotal server-side (apply-discount-code.mts) — the
// parent is responsible for re-mounting CheckoutStep when that happens,
// since a Stripe Checkout Session is priced once, at creation.
export const DiscountCodeForm = ({
	reservationId,
	onChange,
}: DiscountCodeFormProps): FunctionComponent => {
	const [code, setCode] = useState("");
	const apply = useApplyDiscountCode();

	return (
		<div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm">
			<div className="flex gap-2">
				<input
					className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
					disabled={apply.isPending}
					placeholder="Discount code"
					value={code}
					onChange={(event) => {
						setCode(event.target.value);
					}}
				/>
				<Button
					className="px-4 py-2 text-sm"
					disabled={apply.isPending || code.trim().length === 0}
					type="button"
					variant="secondary"
					onClick={() => {
						apply.mutate(
							{ reservationId, code },
							{
								onSuccess: (result) => {
									setCode("");
									onChange(result);
								},
							}
						);
					}}
				>
					{apply.isPending ? "Applying…" : "Apply"}
				</Button>
			</div>
			{apply.isError && <p className="text-red-600">{apply.error.message}</p>}
		</div>
	);
};
