import type { FunctionComponent } from "../../common/types";

// PLACEHOLDER contact details — replace with the real inbox before launch.
export const Footer = (): FunctionComponent => {
	return (
		<footer className="border-t border-neutral-200 py-8 text-center text-sm text-neutral-500">
			<p>© {new Date().getFullYear()} Cabin Between Rivers</p>
			<p className="mt-1">Questions? Email hello@example.com</p>
		</footer>
	);
};
