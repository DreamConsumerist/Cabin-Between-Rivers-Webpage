// Terms & Conditions content: stored as plain text (see db/schema.ts's
// settings.termsContent), not raw HTML — the admin editor is a plain textarea,
// and rendering it as escaped text (rather than trusting stored markup)
// removes any chance of the terms editor becoming a stored-XSS vector against
// the guests who view it in the booking flow's iframe (see TermsStep.tsx).
//
// The only structure supported is intentionally minimal: blank-line-separated
// blocks become paragraphs, a block starting with "# " becomes the page title,
// and one starting with "## " becomes a section heading — enough to match the
// shape of the original terms document without needing a rich-text editor or
// a markdown library.

export const DEFAULT_TERMS_CONTENT = `# Cabin Between Rivers — Rental Terms & Conditions

These terms govern your reservation and stay at Cabin Between Rivers ("the Property"). By checking the box on the booking page, you agree to the terms below on behalf of yourself and everyone in your party.

## 1. Reservations and Payment

A reservation is held for a limited time while payment is completed. Full payment is due at the time of booking. Rates include the nightly rate and a one-time cleaning fee, shown before you confirm payment.

## 2. Cancellations

Cancellations made at least 14 days before check-in are eligible for a full refund. Cancellations made within 14 days of check-in are non-refundable, except where required by law.

## 3. Check-in and Check-out

Check-in is after 3:00 PM and check-out is by 11:00 AM local time, unless otherwise arranged in advance. Early check-in or late check-out is subject to availability.

## 4. Occupancy

The Property may not be occupied by more guests than the number booked. Events, parties, and commercial photography are not permitted without prior written approval.

## 5. House Rules

No smoking indoors. Pets are welcome with prior approval only. Quiet hours are from 10:00 PM to 8:00 AM. Guests are responsible for the conduct of everyone in their party.

## 6. Damage and Liability

Guests are responsible for any damage to the Property beyond normal wear and tear. The Property is provided as-is; guests use all amenities (including the deck, stove, and grounds) at their own risk. The host is not liable for injury, loss, or damage to personal property except where required by law.

## 7. Right of Entry

The host or an authorized representative may enter the Property during a stay to address maintenance emergencies, with notice given whenever reasonably possible.

## 8. Changes to These Terms

These terms may be updated from time to time. The version in effect at the time of your booking governs that reservation.

## 9. Contact

Questions about these terms can be sent to the contact email listed on the site before completing your booking.`;

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

// Plain text -> HTML fragment (see module comment for the supported shape).
export const renderTermsHtml = (content: string): string =>
	content
		.trim()
		.split(/\n{2,}/)
		.map((block) => {
			const trimmed = block.trim();
			if (trimmed.startsWith("## ")) {
				return `<h2>${escapeHtml(trimmed.slice(3).trim())}</h2>`;
			}
			if (trimmed.startsWith("# ")) {
				return `<h1>${escapeHtml(trimmed.slice(2).trim())}</h1>`;
			}
			return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br />")}</p>`;
		})
		.join("\n");
