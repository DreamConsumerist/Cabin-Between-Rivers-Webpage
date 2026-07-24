import { useState } from "react";
import dayjs from "dayjs";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { formatCents } from "../booking/dateUtilities";
import type { AdminBooking, Conflict, DoubleBookingSource } from "./api";
import {
	useAdminBookings,
	useAdminCancelReservation,
	useConflicts,
	useReopenConflict,
	useResolveConflict,
} from "./hooks";

const SOURCE_LABEL: Record<DoubleBookingSource, string> = {
	"airbnb-sync": "Airbnb",
	"vrbo-sync": "Vrbo",
	"stripe-webhook": "Payment race",
};

// See BookingsList's formatDate for why this uses dayjs rather than
// `new Date(iso)` — checkIn/checkOut are date-only strings, and dayjs parses
// those as local midnight instead of UTC midnight.
const formatDate = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

type Filter = "open" | "resolved" | "all";

const cancelConfirmMessage = (reservation: AdminBooking): string =>
	reservation.status === "confirmed"
		? `Cancel reservation #${reservation.id} (${reservation.guestName}) and refund ${formatCents(reservation.amountTotal)}? This cannot be undone.`
		: `Cancel reservation #${reservation.id} (${reservation.guestName})? Nothing has been charged yet. This cannot be undone.`;

type ConflictRowProps = { conflict: Conflict; reservation: AdminBooking | undefined };

const ConflictRow = ({ conflict, reservation }: ConflictRowProps): FunctionComponent => {
	const [note, setNote] = useState("");
	const resolve = useResolveConflict();
	const reopen = useReopenConflict();
	const cancelReservation = useAdminCancelReservation();
	const resolved = conflict.resolvedAt != null;

	const canCancel = reservation && (reservation.status === "confirmed" || reservation.status === "pending");

	return (
		<li className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4">
			<div className="flex flex-wrap items-center gap-2">
				<span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
					{SOURCE_LABEL[conflict.source]}
				</span>
				<span className="text-sm text-neutral-700">
					{formatDate(conflict.checkIn)} – {formatDate(conflict.checkOut)}
				</span>
				{reservation && (
					<span className="text-sm text-neutral-500">
						· Reservation #{reservation.id} ({reservation.guestName}) · {reservation.status}
					</span>
				)}
			</div>
			<p className="text-sm text-neutral-600">{conflict.detail}</p>

			{resolved ? (
				<div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
					<span>Resolved {conflict.resolvedAt && formatDate(conflict.resolvedAt)}</span>
					{conflict.resolutionNote && <span>· {conflict.resolutionNote}</span>}
					<Button
						className="px-3 py-1.5 text-sm"
						disabled={reopen.isPending}
						type="button"
						variant="secondary"
						onClick={() => {
							reopen.mutate(conflict.id);
						}}
					>
						Reopen
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap items-end gap-2">
					<textarea
						className="min-w-48 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400"
						placeholder="Resolution note (optional)"
						rows={1}
						value={note}
						onChange={(event) => {
							setNote(event.target.value);
						}}
					/>
					<Button
						className="px-3 py-1.5 text-sm"
						disabled={resolve.isPending}
						type="button"
						variant="secondary"
						onClick={() => {
							resolve.mutate({ id: conflict.id, note });
						}}
					>
						Mark resolved
					</Button>
					{canCancel && reservation && (
						<Button
							className="px-3 py-1.5 text-sm"
							disabled={cancelReservation.isPending}
							type="button"
							onClick={() => {
								if (!confirm(cancelConfirmMessage(reservation))) return;
								cancelReservation.mutate(reservation.id, {
									onSuccess: () => {
										resolve.mutate({
											id: conflict.id,
											note: "Auto-resolved: reservation cancelled and refunded via admin tool.",
										});
									},
								});
							}}
						>
							{cancelReservation.isPending ? "Cancelling…" : "Cancel & refund reservation"}
						</Button>
					)}
				</div>
			)}
			{cancelReservation.isError && (
				<p className="text-sm text-red-600">{cancelReservation.error.message}</p>
			)}
		</li>
	);
};

export const ConflictsList = (): FunctionComponent => {
	const [filter, setFilter] = useState<Filter>("open");
	const resolved = filter === "all" ? undefined : filter === "resolved";
	const { data, isPending, error } = useConflicts(resolved);
	const bookings = useAdminBookings();

	const conflicts = data?.conflicts ?? [];
	const reservationsById = new Map((bookings.data?.reservations ?? []).map((r) => [r.id, r]));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				{(["open", "resolved", "all"] as const).map((f) => (
					<button
						key={f}
						type="button"
						className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${
							filter === f ? "bg-brand-600 text-neutral-900" : "bg-neutral-100 text-neutral-600"
						}`}
						onClick={() => {
							setFilter(f);
						}}
					>
						{f}
					</button>
				))}
			</div>

			{isPending && <p className="text-neutral-500">Loading conflicts…</p>}
			{error && <p className="text-sm text-red-600">{error.message}</p>}
			{!isPending && conflicts.length === 0 && (
				<p className="text-neutral-500">No {filter === "all" ? "" : filter} conflicts.</p>
			)}

			{conflicts.length > 0 && (
				<ul className="flex flex-col gap-3">
					{conflicts.map((conflict) => (
						<ConflictRow
							key={conflict.id}
							conflict={conflict}
							reservation={
								conflict.reservationId != null ? reservationsById.get(conflict.reservationId) : undefined
							}
						/>
					))}
				</ul>
			)}
		</div>
	);
};
