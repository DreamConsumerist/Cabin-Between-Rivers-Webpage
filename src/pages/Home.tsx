import { Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../common/types";
import heroImage from "../assets/hero.jpg";

type Amenity = { title: string; description: string };

// PLACEHOLDER copy — swap in the real property details before launch.
const AMENITIES: Array<Amenity> = [
	{ title: "Sleeps 6", description: "Two bedrooms plus a queen sofa bed in the living room." },
	{ title: "Riverside deck", description: "A wraparound deck looking out over the water." },
	{ title: "Wood-burning stove", description: "Cozy heat for cool nights, split wood provided." },
	{ title: "Full kitchen", description: "Everything you need to cook a real meal." },
];

export const Home = (): FunctionComponent => {
	return (
		<main className="flex flex-col items-center">
			<section className="flex w-full max-w-5xl flex-col items-center gap-6 px-8 py-20 text-center">
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					Cabin Between Rivers
				</h1>
				<p className="max-w-xl text-lg text-neutral-500">
					A quiet stay, right where two rivers meet.
				</p>
				<Link
					className="mt-2 rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700"
					to="/booking"
				>
					Check availability
				</Link>
			</section>

			<div className="w-full max-w-5xl px-8">
				<img
					alt="Cabin Between Rivers exterior"
					className="w-full rounded-xl object-cover"
					src={heroImage}
				/>
			</div>

			<section className="grid w-full max-w-5xl grid-cols-1 gap-6 px-8 py-16 sm:grid-cols-2 lg:grid-cols-4">
				{AMENITIES.map((amenity) => (
					<div key={amenity.title} className="rounded-xl border border-neutral-200 p-6 text-left">
						<h3 className="font-semibold text-brand-700">{amenity.title}</h3>
						<p className="mt-1 text-sm text-neutral-500">{amenity.description}</p>
					</div>
				))}
			</section>

			<section className="flex w-full max-w-5xl flex-col items-center gap-4 px-8 py-16 text-center">
				<h2 className="text-2xl font-semibold tracking-tight">Want to know more?</h2>
				<Link className="text-brand-700 underline" to="/about">
					Read about the cabin
				</Link>
			</section>

			<section className="flex w-full flex-col items-center gap-4 bg-brand-50 px-8 py-16 text-center">
				<h2 className="text-2xl font-semibold tracking-tight">Ready for your stay?</h2>
				<Link
					className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700"
					to="/booking"
				>
					Book now
				</Link>
			</section>
		</main>
	);
};
