import type { FunctionComponent } from "../common/types";

export const Home = (): FunctionComponent => {
	return (
		<main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-4xl font-semibold tracking-tight">
				Cabin Between Rivers
			</h1>
			<p className="text-neutral-500">Reservations coming soon.</p>
		</main>
	);
};
