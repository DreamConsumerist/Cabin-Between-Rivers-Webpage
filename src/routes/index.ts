import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../pages/Home";

export const Route = createFileRoute("/")({
	component: Home,
	head: () => ({
		meta: [
			{ title: "Cabin Between Rivers | Riverside Cabin Rental" },
			{
				name: "description",
				content:
					"Book a stay at Cabin Between Rivers, a riverside cabin retreat with a wraparound deck, wood-burning stove, and full kitchen.",
			},
			{
				"script:ld+json": {
					"@context": "https://schema.org",
					"@type": "LodgingBusiness",
					name: "Cabin Between Rivers",
					description:
						"A riverside cabin retreat with a wraparound deck, wood-burning stove, and full kitchen.",
					image: "https://cabinbetweenrivers.com/og-image.jpg",
					url: "https://cabinbetweenrivers.com/",
					// address, telephone, and priceRange are deliberately omitted —
					// real property/contact info isn't public yet (see Footer.tsx's
					// placeholder email and SETUP.md's guest-email-detail TODO item).
					// Add them here once that's resolved.
				},
			},
		],
	}),
});
