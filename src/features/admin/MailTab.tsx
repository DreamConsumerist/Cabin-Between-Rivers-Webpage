import type { FunctionComponent } from "../../common/types";
import { GuestEmailsForm } from "./GuestEmailsForm";
import { NotificationsForm } from "./NotificationsForm";

// Groups every outbound-email concern under one tab: who gets notified
// (NotificationsForm — booking-confirmed/double-booking alerts, an internal
// audience) and what guests themselves receive (GuestEmailsForm — arrival/
// checkout reminders). Each keeps its own independent save action/mutation;
// this only merges the tab-level grouping, not the underlying settings
// fields or API calls.
export const MailTab = (): FunctionComponent => (
	<div className="flex flex-col gap-10">
		<section className="flex flex-col gap-4">
			<h2 className="text-lg font-semibold text-neutral-900">Notifications</h2>
			<NotificationsForm />
		</section>
		<section className="flex flex-col gap-4 border-t border-neutral-200 pt-10">
			<h2 className="text-lg font-semibold text-neutral-900">Guest Emails</h2>
			<GuestEmailsForm />
		</section>
	</div>
);
