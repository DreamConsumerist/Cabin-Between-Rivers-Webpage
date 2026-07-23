import { useState } from "react";
import type { FunctionComponent } from "../common/types";
import { Button } from "../components/ui/Button";
import { GalleryManager } from "../features/admin/GalleryManager";
import { LoginForm } from "../features/admin/LoginForm";
import { SettingsForm } from "../features/admin/SettingsForm";
import { useAdminLogout, useAdminMe } from "../features/admin/hooks";

type Tab = "gallery" | "pricing";

const TAB_LABEL: Record<Tab, string> = {
	gallery: "Gallery",
	pricing: "Pricing",
};

export const Admin = (): FunctionComponent => {
	const { data, isPending } = useAdminMe();
	const logout = useAdminLogout();
	const [tab, setTab] = useState<Tab>("gallery");

	if (isPending) {
		return (
			<main className="mx-auto max-w-3xl px-8 py-16">
				<p className="text-neutral-500">Loading…</p>
			</main>
		);
	}

	if (!data?.authenticated) {
		return (
			<main className="mx-auto flex max-w-3xl flex-col px-8 py-16">
				<LoginForm />
			</main>
		);
	}

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-16">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
				<Button variant="secondary" onClick={() => { logout.mutate(); }}>
					Sign out
				</Button>
			</div>

			<div className="flex gap-2 border-b border-neutral-200">
				{(["gallery", "pricing"] as const).map((t) => (
					<button
						key={t}
						type="button"
						className={`px-4 py-2 text-sm font-medium ${
							tab === t
								? "border-b-2 border-brand-600 text-brand-700"
								: "text-neutral-500 hover:text-neutral-700"
						}`}
						onClick={() => { setTab(t); }}
					>
						{TAB_LABEL[t]}
					</button>
				))}
			</div>

			{tab === "gallery" ? <GalleryManager /> : <SettingsForm />}
		</main>
	);
};
