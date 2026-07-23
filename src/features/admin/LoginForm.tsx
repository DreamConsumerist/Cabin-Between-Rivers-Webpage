import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import { useAdminLogin } from "./hooks";
import { loginSchema, type LoginInput } from "./schema";

export const LoginForm = (): FunctionComponent => {
	const login = useAdminLogin();
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
				type="password"
				{...register("password")}
				error={errors.password?.message}
			/>
			{login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}
			<Button disabled={login.isPending} type="submit">
				{login.isPending ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
};
