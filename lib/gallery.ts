import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { galleryPhotos } from "../db/schema";

export type GalleryPhotoRow = typeof galleryPhotos.$inferSelect;

export const listGalleryPhotos = async (): Promise<Array<GalleryPhotoRow>> =>
	db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.position), asc(galleryPhotos.id));

export const getGalleryPhotoById = async (id: number): Promise<GalleryPhotoRow | null> => {
	const rows = await db.select().from(galleryPhotos).where(eq(galleryPhotos.id, id)).limit(1);
	return rows[0] ?? null;
};

export type NewGalleryPhoto = {
	blobKey: string;
	alt: string;
	width: number;
	height: number;
};

// Position is computed as max+1 in the same statement as the insert, so two
// concurrent uploads can't race onto the same position.
export const insertGalleryPhoto = async (photo: NewGalleryPhoto): Promise<GalleryPhotoRow> => {
	const rows = await db
		.insert(galleryPhotos)
		.values({
			...photo,
			position: sql`(select coalesce(max(${galleryPhotos.position}), -1) + 1 from ${galleryPhotos})`,
		})
		.returning();
	return rows[0]!;
};

export const deleteGalleryPhoto = async (id: number): Promise<GalleryPhotoRow | null> => {
	const rows = await db.delete(galleryPhotos).where(eq(galleryPhotos.id, id)).returning();
	return rows[0] ?? null;
};

export const updateGalleryPhotoAlt = async (id: number, alt: string): Promise<GalleryPhotoRow | null> => {
	const rows = await db
		.update(galleryPhotos)
		.set({ alt })
		.where(eq(galleryPhotos.id, id))
		.returning();
	return rows[0] ?? null;
};

// `orderedIds` is the full new front-to-back order; each id's position becomes
// its index in that array.
export const reorderGalleryPhotos = async (orderedIds: Array<number>): Promise<void> => {
	await Promise.all(
		orderedIds.map((id, position) =>
			db.update(galleryPhotos).set({ position }).where(eq(galleryPhotos.id, id))
		)
	);
};
