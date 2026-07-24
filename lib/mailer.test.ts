import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/mailer.ts imports getSettings from ./availability, which itself
// imports ../db/client — a module that throws at load time if NETLIFY_DB_URL
// isn't set. Mocking ./availability directly (rather than db/client) also
// lets each test control what getSettings resolves to.
vi.mock("./availability", () => ({ getSettings: vi.fn() }));

const { getSettings } = await import("./availability");
const { notifyDoubleBooking, parseNotificationEmails, sendEmail } = await import("./mailer");

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
