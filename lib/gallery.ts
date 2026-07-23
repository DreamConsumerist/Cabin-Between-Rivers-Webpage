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
	alt: string | null;
	width: number;
	height: number;
};

// An arbitrary constant identifying "assigning a gallery_photos position" as a
// lock scope — pg_advisory_xact_lock takes any bigint key, this just needs to
// be consistent across callers and not collide with locks taken elsewhere.
const GALLERY_POSITION_LOCK_KEY = 727_100;

// Position is computed as max+1 in the same statement as the insert. Under
// READ COMMITTED (Postgres's default) that subquery alone doesn't stop two
// concurrent inserts from both reading the same pre-insert max, so the whole
// read-then-insert is wrapped in a transaction holding a transaction-scoped
// advisory lock: the second concurrent call blocks until the first commits
// (releasing the lock), by which point its row is visible to the second
// call's max(position) subquery.
export const insertGalleryPhoto = async (photo: NewGalleryPhoto): Promise<GalleryPhotoRow> => {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${GALLERY_POSITION_LOCK_KEY})`);
		const rows = await tx
			.insert(galleryPhotos)
			.values({
				...photo,
				position: sql`(select coalesce(max(${galleryPhotos.position}), -1) + 1 from ${galleryPhotos})`,
			})
			.returning();
		return rows[0]!;
	});
};

export const deleteGalleryPhoto = async (id: number): Promise<GalleryPhotoRow | null> => {
	const rows = await db.delete(galleryPhotos).where(eq(galleryPhotos.id, id)).returning();
	return rows[0] ?? null;
};

export const updateGalleryPhotoAlt = async (id: number, alt: string | null): Promise<GalleryPhotoRow | null> => {
	const rows = await db
		.update(galleryPhotos)
		.set({ alt })
		.where(eq(galleryPhotos.id, id))
		.returning();
	return rows[0] ?? null;
};

// `orderedIds` is the full new front-to-back order; each id's position becomes
// its index in that array. Wrapped in a transaction so a failure partway
// through (dropped connection, timeout) rolls every update back instead of
// leaving positions half-updated.
export const reorderGalleryPhotos = async (orderedIds: Array<number>): Promise<void> => {
	await db.transaction(async (tx) => {
		await Promise.all(
			orderedIds.map((id, position) =>
				tx.update(galleryPhotos).set({ position }).where(eq(galleryPhotos.id, id))
			)
		);
	});
};
