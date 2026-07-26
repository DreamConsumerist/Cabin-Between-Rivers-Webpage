import type { ButtonHTMLAttributes } from "react";
import type { FunctionComponent } from "../../common/types";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "danger";
	isLoading?: boolean;
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary: "bg-brand-600 text-neutral-900 hover:bg-brand-700 disabled:bg-brand-300",
	secondary:
		"bg-transparent text-brand-700 border border-brand-300 hover:bg-brand-50 disabled:text-neutral-400 disabled:border-neutral-200",
	danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

const Spinner = (): FunctionComponent => (
	<svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
		<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
		<path className="opacity-75" d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2Z" fill="currentColor" />
	</svg>
);

// `isLoading` both disables the button and swaps in a spinner ahead of the
// label — used by ConfirmDialog so a destructive action's own confirm button
// shows progress instead of leaving the dialog looking idle mid-mutation.
export const Button = ({
	variant = "primary",
	className = "",
	isLoading = false,
	disabled = false,
	children,
	...props
}: ButtonProps): FunctionComponent => {
	return (
		<button
			{...props}
			className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
			disabled={disabled || isLoading}
		>
			{isLoading && <Spinner />}
			{children}
		</button>
	);
};
