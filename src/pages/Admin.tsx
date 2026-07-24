import { useState } from "react";
import type { FunctionComponent } from "../common/types";
import { Button } from "../components/ui/Button";
import { BookingsList } from "../features/admin/BookingsList";
import { ConflictsList } from "../features/admin/ConflictsList";
import { GalleryManager } from "../features/admin/GalleryManager";
import { IcalForm } from "../features/admin/IcalForm";
import { LoginForm } from "../features/admin/LoginForm";
import { SettingsForm } from "../features/admin/SettingsForm";
import { TermsForm } from "../features/admin/TermsForm";
import { useAdminLogout, useAdminMe, useConflicts } from "../features/admin/hooks";

type Tab = "bookings" | "gallery" | "pricing" | "ical" | "conflicts" | "terms";

const TAB_LABEL: Record<Tab, string> = {
	bookings: "Bookings",
	gallery: "Gallery",
	pricing: "Pricing",
	ical: "iCal",
	conflicts: "Conflicts",
	terms: "Terms",
};

export const Admin = (): FunctionComponent => {
	const { data, isPending } = useAdminMe();
	const logout = useAdminLogout();
	const [tab, setTab] = useState<Tab>("bookings");
	// Shares its query key with ConflictsList's own useConflicts(false) call, so
	// this doesn't duplicate the fetch once that tab is opened.
	const openConflicts = useConflicts(false);
	const openConflictCount = openConflicts.data?.conflicts.length ?? 0;

	if (isPending) {
		return (
			<main className="w-full">
				<div className="mx-auto max-w-3xl px-8 py-16">
					<p className="text-neutral-500">Loading…</p>
				</div>
			</main>
		);
	}

	if (!data?.authenticated) {
		return (
			<main className="w-full">
				<div className="mx-auto flex max-w-3xl flex-col px-8 py-16">
					<LoginForm />
				</div>
			</main>
		);
	}

	return (
		<main className="w-full">
			<div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-16">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
					<Button
						variant="secondary"
						onClick={() => {
							logout.mutate();
						}}
					>
						Sign out
					</Button>
				</div>

				<div className="flex gap-2 border-b border-neutral-200">
					{(["bookings", "gallery", "pricing", "ical", "conflicts", "terms"] as const).map((t) => (
						<button
							key={t}
							type="button"
							className={`px-4 py-2 text-sm font-medium ${
								tab === t
									? "border-b-2 border-brand-600 text-brand-700"
									: "text-neutral-500 hover:text-neutral-700"
							}`}
							onClick={() => {
								setTab(t);
							}}
						>
							{TAB_LABEL[t]}
							{t === "conflicts" && openConflictCount > 0 && (
								<span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
									{openConflictCount}
								</span>
							)}
						</button>
					))}
				</div>

				{tab === "bookings" && <BookingsList />}
				{tab === "gallery" && <GalleryManager />}
				{tab === "pricing" && <SettingsForm />}
				{tab === "ical" && <IcalForm />}
				{tab === "conflicts" && <ConflictsList />}
				{tab === "terms" && <TermsForm />}
			</div>
		</main>
	);
};
