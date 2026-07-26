import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/mailer.ts imports getSettings from ./availability, which itself
// imports ../db/client — a module that throws at load time if NETLIFY_DB_URL
// isn't set. Mocking ./availability directly (rather than db/client) also
// lets each test control what getSettings resolves to.
vi.mock("./availability", () => ({ getSettings: vi.fn() }));

const { getSettings } = await import("./availability");
const {
	notifyBookingConfirmed,
	notifyDoubleBooking,
	notifyGuestCancellation,
	parseNotificationEmails,
	sendBookingConfirmationEmail,
	sendCancellationEmail,
	sendEmail,
} = await import("./mailer");

describe("parseNotificationEmails", () => {
	it("returns an empty list for null/undefined/empty input", () => {
		expect(parseNotificationEmails(null)).toEqual([]);
		expect(parseNotificationEmails(undefined)).toEqual([]);
		expect(parseNotificationEmails("")).toEqual([]);
	});

	it("splits, trims, and drops empty entries", () => {
		expect(parseNotificationEmails(" a@x.com ,b@x.com,, c@x.com ")).toEqual([
			"a@x.com",
			"b@x.com",
			"c@x.com",
		]);
	});
});

describe("sendEmail", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
	});

	it("POSTs to the Resend API with the expected auth header and body", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendEmail({ to: ["admin@example.com"], subject: "Subject", text: "Body" });

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-key",
					"content-type": "application/json",
				}),
			})
		);
		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body).toEqual({
			from: "bookings@example.com",
			to: ["admin@example.com"],
			subject: "Subject",
			text: "Body",
		});
	});

	it("includes html in the body when provided", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendEmail({
			to: ["admin@example.com"],
			subject: "Subject",
			text: "Body",
			html: "<p>Body</p>",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.html).toBe("<p>Body</p>");
	});

	it("includes reply_to in the body when provided, omits it otherwise", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendEmail({
			to: ["admin@example.com"],
			subject: "Subject",
			text: "Body",
			replyTo: ["owner@example.com"],
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.reply_to).toEqual(["owner@example.com"]);

		await sendEmail({ to: ["admin@example.com"], subject: "Subject", text: "Body", replyTo: [] });
		const secondBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
		expect(secondBody.reply_to).toBeUndefined();
	});

	it("throws when the Resend API responds with a non-2xx status", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response("bad request", { status: 400 })) as unknown as typeof fetch;

		await expect(sendEmail({ to: ["admin@example.com"], subject: "s", text: "t" })).rejects.toThrow(
			/Resend API error 400/
		);
	});
});

describe("notifyDoubleBooking", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
		vi.mocked(getSettings).mockReset();
	});

	it("no-ops without calling fetch when no notification emails are configured", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		const fetchMock = vi.fn();
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyDoubleBooking({
			source: "airbnb-sync",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			detail: "test",
		});

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("swallows and logs a failed send instead of throwing", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: "admin@example.com" } as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			notifyDoubleBooking({
				source: "stripe-webhook",
				checkIn: "2026-08-01",
				checkOut: "2026-08-05",
				detail: "test",
			})
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("notifyBookingConfirmed", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
		vi.mocked(getSettings).mockReset();
	});

	it("no-ops without calling fetch when no notification emails are configured", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		const fetchMock = vi.fn();
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyBookingConfirmed({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: "https://cabinbetweenrivers.com/api/admin-id-photo?reservationId=42",
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends to the configured recipients with the booking details, including the reservation ID and a photo ID link, in the body", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyBookingConfirmed({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: "https://cabinbetweenrivers.com/api/admin-id-photo?reservationId=42",
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.to).toEqual(["admin@example.com"]);
		expect(body.text).toContain("Jane Doe");
		expect(body.text).toContain("$123.45");
		expect(body.text).toContain("#42");
		expect(body.text).toContain("https://cabinbetweenrivers.com/api/admin-id-photo?reservationId=42");
		expect(body.html).toContain("Jane Doe");
		expect(body.html).toContain("$123.45");
		expect(body.html).toContain("#42");
		expect(body.html).toContain('href="https://cabinbetweenrivers.com/api/admin-id-photo?reservationId=42"');
	});

	it("shows 'Not uploaded' instead of a link when no photo ID was uploaded", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyBookingConfirmed({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: null,
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.text).toContain("Photo ID: Not uploaded");
		expect(body.html).toContain("Not uploaded");
		expect(body.html).not.toContain("<a href");
	});

	it("swallows and logs a failed send instead of throwing", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			notifyBookingConfirmed({
				reservationId: 42,
				guestName: "Jane Doe",
				guestEmail: "jane@example.com",
				checkIn: "2026-08-01",
				checkOut: "2026-08-05",
				guests: 2,
				amountTotal: 12_345,
				idPhotoUrl: null,
				cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
			})
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("sendBookingConfirmationEmail", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
		vi.mocked(getSettings).mockReset();
	});

	it("sets reply_to to the configured notification emails, so a guest reply reaches the admin instead of the send-only from-address", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com, owner@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendBookingConfirmationEmail({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: null,
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.reply_to).toEqual(["admin@example.com", "owner@example.com"]);
	});

	it("omits reply_to when no notification emails are configured", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendBookingConfirmationEmail({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: null,
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.reply_to).toBeUndefined();
	});

	it("sends to the guest's own email with the booking details and a cancellation link in the body", async () => {
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendBookingConfirmationEmail({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: null,
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.to).toEqual(["jane@example.com"]);
		expect(body.text).toContain("Jane Doe");
		expect(body.text).toContain("$123.45");
		expect(body.text).toContain(
			"https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret"
		);
		expect(body.html).toContain("Jane Doe");
		expect(body.html).toContain("$123.45");
		expect(body.html).toContain("Aug 1, 2026");
		expect(body.html).toContain("Aug 5, 2026");
		expect(body.html).toContain(
			'href="https://cabinbetweenrivers.com/booking/cancel?reservationId=42&amp;token=secret"'
		);
	});

	it("escapes HTML in guest-supplied fields in the html body", async () => {
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendBookingConfirmationEmail({
			reservationId: 42,
			guestName: "<script>alert(1)</script>",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			guests: 2,
			amountTotal: 12_345,
			idPhotoUrl: null,
			cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.html).not.toContain("<script>");
		expect(body.html).toContain("&lt;script&gt;");
	});

	it("swallows and logs a failed send instead of throwing", async () => {
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			sendBookingConfirmationEmail({
				reservationId: 42,
				guestName: "Jane Doe",
				guestEmail: "jane@example.com",
				checkIn: "2026-08-01",
				checkOut: "2026-08-05",
				guests: 2,
				amountTotal: 12_345,
				idPhotoUrl: null,
				cancellationUrl: "https://cabinbetweenrivers.com/booking/cancel?reservationId=42&token=secret",
			})
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("sendCancellationEmail", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
		vi.mocked(getSettings).mockReset();
	});

	it("says the guest was refunded and includes the amount, when refunded", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendCancellationEmail({
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			amountTotal: 12_345,
			refunded: true,
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.to).toEqual(["jane@example.com"]);
		expect(body.subject).toContain("refunded");
		expect(body.text).toContain("refund has been issued");
		expect(body.text).toContain("Refunded: $123.45");
		expect(body.html).toContain("refund has been issued");
		expect(body.html).toContain("$123.45");
	});

	it("says the guest was not charged and omits an amount, when not refunded", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendCancellationEmail({
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			amountTotal: 12_345,
			refunded: false,
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.subject).not.toContain("refunded");
		expect(body.text).toContain("You were not charged");
		expect(body.text).not.toContain("$123.45");
		expect(body.html).toContain("You were not charged");
		expect(body.html).not.toContain("$123.45");
	});

	it("sets reply_to to the configured notification emails", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await sendCancellationEmail({
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			amountTotal: 12_345,
			refunded: true,
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.reply_to).toEqual(["admin@example.com"]);
	});

	it("swallows and logs a failed send instead of throwing", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			sendCancellationEmail({
				guestName: "Jane Doe",
				guestEmail: "jane@example.com",
				checkIn: "2026-08-01",
				checkOut: "2026-08-05",
				amountTotal: 12_345,
				refunded: true,
			})
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("notifyGuestCancellation", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
		vi.mocked(getSettings).mockReset();
	});

	it("no-ops without calling fetch when no notification emails are configured", async () => {
		vi.mocked(getSettings).mockResolvedValue({ notificationEmails: null } as never);
		const fetchMock = vi.fn();
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyGuestCancellation({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			amountTotal: 12_345,
		});

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends to the configured recipients with the reservation ID and refunded amount in the body", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		await notifyGuestCancellation({
			reservationId: 42,
			guestName: "Jane Doe",
			guestEmail: "jane@example.com",
			checkIn: "2026-08-01",
			checkOut: "2026-08-05",
			amountTotal: 12_345,
		});

		const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
		expect(body.to).toEqual(["admin@example.com"]);
		expect(body.text).toContain("#42");
		expect(body.text).toContain("Jane Doe");
		expect(body.text).toContain("$123.45");
	});

	it("swallows and logs a failed send instead of throwing", async () => {
		vi.mocked(getSettings).mockResolvedValue({
			notificationEmails: "admin@example.com",
		} as never);
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("NOTIFICATION_FROM_EMAIL", "bookings@example.com");
		global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			notifyGuestCancellation({
				reservationId: 42,
				guestName: "Jane Doe",
				guestEmail: "jane@example.com",
				checkIn: "2026-08-01",
				checkOut: "2026-08-05",
				amountTotal: 12_345,
			})
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
