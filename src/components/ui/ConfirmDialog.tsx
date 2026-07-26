import type { ReactNode } from "react";
import type { FunctionComponent } from "../../common/types";
import { Button } from "./Button";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
	title: string;
	message: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	isDestructive?: boolean;
	isPending: boolean;
	error?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

// Shared replacement for the admin panel's old `window.confirm()` calls.
// While isPending (the mutation is in flight) every escape hatch is
// disabled: both buttons, plus Modal's own close paths (X button, overlay
// click, Escape) via the no-op onClose — so there's no way to dismiss the
// dialog and lose track of a request that's still running.
export const ConfirmDialog = ({
	title,
	message,
	confirmLabel,
	cancelLabel = "Cancel",
	isDestructive = true,
	isPending,
	error,
	onConfirm,
	onCancel,
}: ConfirmDialogProps): FunctionComponent => (
	<Modal title={title} onClose={isPending ? (): void => {} : onCancel}>
		<div className="text-sm text-neutral-600">{message}</div>
		{error && <p className="mt-3 text-sm text-red-600">{error}</p>}
		<div className="mt-6 flex justify-end gap-3">
			<Button disabled={isPending} type="button" variant="secondary" onClick={onCancel}>
				{cancelLabel}
			</Button>
			<Button isLoading={isPending} type="button" variant={isDestructive ? "danger" : "primary"} onClick={onConfirm}>
				{confirmLabel}
			</Button>
		</div>
	</Modal>
);
