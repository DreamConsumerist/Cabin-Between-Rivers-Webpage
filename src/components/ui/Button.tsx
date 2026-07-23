import type { ButtonHTMLAttributes } from "react";
import type { FunctionComponent } from "../../common/types";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary";
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
	secondary:
		"bg-transparent text-brand-700 border border-brand-300 hover:bg-brand-50 disabled:text-neutral-400 disabled:border-neutral-200",
};

export const Button = ({
	variant = "primary",
	className = "",
	...props
}: ButtonProps): FunctionComponent => {
	return (
		<button
			{...props}
			className={`rounded-lg px-5 py-2.5 font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
		/>
	);
};
