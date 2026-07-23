import type { InputHTMLAttributes } from "react";
import type { FunctionComponent } from "../../common/types";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	error?: string;
};

export const TextField = ({
	label,
	error,
	id,
	className = "",
	...props
}: TextFieldProps): FunctionComponent => {
	const fieldId = id ?? props.name;

	return (
		<label className="flex flex-col gap-1 text-left" htmlFor={fieldId}>
			<span className="text-sm font-medium text-neutral-700">{label}</span>
			<input
				{...props}
				aria-invalid={error ? true : undefined}
				id={fieldId}
				className={`rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400 ${
					error ? "border-red-400" : "border-neutral-300"
				} ${className}`}
			/>
			{error && <span className="text-sm text-red-600">{error}</span>}
		</label>
	);
};
