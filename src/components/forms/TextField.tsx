import type { InputHTMLAttributes, ReactNode } from "react";
import type { FunctionComponent } from "../../common/types";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	error?: string;
	// Content joined to the input's trailing edge (e.g. a button), forming a
	// single grouped control — same idea as a Bootstrap input-group.
	trailing?: ReactNode;
};

export const TextField = ({
	label,
	error,
	id,
	className = "",
	trailing,
	...props
}: TextFieldProps): FunctionComponent => {
	const fieldId = id ?? props.name;

	return (
		<label className="flex flex-col gap-1 text-left" htmlFor={fieldId}>
			<span className="text-sm font-medium text-neutral-700">{label}</span>
			<div className="flex">
				<input
					{...props}
					aria-invalid={error ? true : undefined}
					id={fieldId}
					className={`w-full border px-3 py-2 outline-none focus:z-10 focus:ring-2 focus:ring-brand-400 ${
						trailing ? "rounded-l-lg" : "rounded-lg"
					} ${error ? "border-red-400" : "border-neutral-300"} ${className}`}
				/>
				{trailing}
			</div>
			{error && <span className="text-sm text-red-600">{error}</span>}
		</label>
	);
};
