import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import { useAdminLogin } from "./hooks";
import { loginSchema, type LoginInput } from "./schema";

const EyeIcon = (): FunctionComponent => (
	<svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
		<path
			d="M2.25 12S5.25 5.25 12 5.25 21.75 12 21.75 12 18.75 18.75 12 18.75 2.25 12 2.25 12Z"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const EyeOffIcon = (): FunctionComponent => (
	<svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
		<path
			d="M3 3l18 18M10.58 10.58a3 3 0 0 0 4.24 4.24M9.88 4.61A10.94 10.94 0 0 1 12 4.5c6.75 0 9.75 6.75 9.75 6.75a13.7 13.7 0 0 1-3.22 4.24M6.53 6.53C4.09 8.14 2.25 10.5 2.25 10.5S5.25 17.25 12 17.25a10.6 10.6 0 0 0 3.47-.6"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

export const LoginForm = (): FunctionComponent => {
	const login = useAdminLogin();
	const [showPassword, setShowPassword] = useState(false);
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

	return (
		<form
			className="mx-auto flex w-full max-w-sm flex-col gap-4"
			onSubmit={handleSubmit((data) => { login.mutate(data.password); })}
		>
			<h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
			<TextField
				autoFocus
				label="Password"
				type={showPassword ? "text" : "password"}
				{...register("password")}
				error={errors.password?.message}
				trailing={
					<button
						aria-label={showPassword ? "Hide password" : "Show password"}
						className="flex items-center justify-center rounded-r-lg border border-l-0 border-neutral-300 px-3 text-neutral-500 hover:text-neutral-700"
						type="button"
						onClick={() => { setShowPassword((value) => !value); }}
					>
						{showPassword ? <EyeOffIcon /> : <EyeIcon />}
					</button>
				}
			/>
			{login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}
			<Button disabled={login.isPending} type="submit">
				{login.isPending ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
};
