import { Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../common/types";
import { Gallery } from "../components/ui/Gallery";
import { useGalleryPhotos } from "../features/gallery/hooks";

// PLACEHOLDER copy throughout — replace with the real story, amenities, and house rules.
const AMENITIES = [
	"Sleeps up to 6 guests",
	"Two bedrooms, one bathroom",
	"Wraparound deck over the river confluence",
	"Wood-burning stove",
	"Full kitchen and dining area",
	"Free parking for two vehicles",
];

const HOUSE_RULES = [
	"Check-in after 3:00 PM, check-out by 11:00 AM",
	"No smoking indoors",
	"Pets welcome with prior approval",
	"Quiet hours after 10:00 PM",
];

export const About = (): FunctionComponent => {
	const { data, isPending, error } = useGalleryPhotos();
	const photos = data?.photos ?? [];

	return (
		<main className="w-full">
			<div className="mx-auto flex max-w-3xl flex-col gap-16 px-8 py-16">
				<header className="flex flex-col items-center gap-4 text-center">
					<h1 className="text-3xl font-semibold tracking-tight">
						About the cabin
					</h1>
					<p className="max-w-xl text-neutral-500">
						Tucked into the trees where two rivers meet, Cabin Between Rivers
						has been a family retreat for years — now open for a limited number
						of guests each season.
					</p>
				</header>

				{isPending && (
					<p className="text-center text-neutral-500">Loading photos…</p>
				)}
				{error && (
					<p className="text-center text-sm text-red-600">
						Couldn't load the gallery.
					</p>
				)}
				{photos.length > 0 && <Gallery photos={photos} />}

				<section>
					<h2 className="text-xl font-semibold tracking-tight">Amenities</h2>
					<ul className="mt-4 grid grid-cols-1 gap-2 text-neutral-600 sm:grid-cols-2">
						{AMENITIES.map((item) => (
							<li key={item} className="flex items-start gap-2">
								<span className="text-brand-600">•</span>
								{item}
							</li>
						))}
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold tracking-tight">Good to know</h2>
					<ul className="mt-4 flex flex-col gap-2 text-neutral-600">
						{HOUSE_RULES.map((item) => (
							<li key={item} className="flex items-start gap-2">
								<span className="text-brand-600">•</span>
								{item}
							</li>
						))}
					</ul>
				</section>

				<div className="flex flex-col items-center gap-4 text-center">
					<h2 className="text-xl font-semibold tracking-tight">
						Ready to book?
					</h2>
					<Link
						className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-neutral-900 transition-colors hover:bg-brand-700"
						to="/booking"
					>
						Check availability
					</Link>
				</div>
			</div>
		</main>
	);
};
