import type { FunctionComponent } from "../../common/types";

export const Footer = (): FunctionComponent => {
	return (
		<footer className="w-full border-t border-neutral-200 py-8">
			<div className="mx-auto max-w-5xl px-8 text-center text-sm text-neutral-500">
				<p>© {new Date().getFullYear()} Cabin Between Rivers</p>
				<p className="mt-1">Questions? Email boelineproperties@gmail.com</p>
			</div>
		</footer>
	);
};
