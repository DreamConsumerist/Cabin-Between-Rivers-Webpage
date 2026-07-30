// Default arrival/departure reminder content, admin-editable from the Guest
// Emails tab (see netlify/functions/admin-guest-emails.mts). Same
// "effective content falls back to a default when unset" convention as
// lib/terms.ts's DEFAULT_TERMS_CONTENT — placeholder text the admin is
// expected to replace with the cabin's real door code, wifi, and directions.

export const DEFAULT_CHECKIN_INSTRUCTIONS = `We're looking forward to your stay! Here's what you need to know for check-in:

Check-in is after 3:00 PM. The door code and wifi details will be added here — please update this in the admin panel with your property's actual information.

If you have any trouble finding the property or getting in, just reply to this email.`;

export const DEFAULT_CHECKOUT_INSTRUCTIONS = `Your check-out is coming up. Check-out is by 11:00 AM — here's what to do before you head out:

Please start the dishwasher if you used any dishes, take out the trash, and lock up when you leave. Update this in the admin panel with your property's actual check-out steps.

We hope you enjoyed your stay!`;
