# Moving an existing photo library into Vault

Notes from importing a large Google Photos library (Takeout export, a few hundred GB) into Vault. Nothing here is specific to one account.

## Shape of the problem

- Takeout gives you the original files plus a JSON sidecar per item with `photoTakenTime` (a UTC epoch), GPS and the album name. EXIF inside the file often has the *local* capture time and sometimes an offset.
- Vault's timeline sorts and groups by local wall-clock time (see `backend/README.md`), so the import has to reconcile those two sources per item.

## Steps

1. **Inventory first.** Count items, total size and how many have a real timezone offset before moving anything. It decides whether timezone inference (below) is worth doing.
2. **Transfer with rclone** from the Takeout archive (or straight from Drive) to `s3://<media-bucket>/uploads/<cognito-sub>/`. Name each object `YYYYMMDD_HHMMSS_<hash>_<originalName>` so the base-table order is chronological even before the GSI exists.
3. **Generate thumbnails** into `thumbnails/<sub>/<fileName>.jpg` (a JPEG around 400px on the long edge). The timeline falls back to the original when a thumbnail is missing, which is slow for videos.
4. **Write the DynamoDB rows** with `takenAt`, `tzOffset`, `dateSource`, `width`, `height`, `durationSec`, GPS and `album`.
5. **Run `backend/backfill_taken_at.py`** (dry-run first). It normalises `takenAt` to the wall-clock invariant, infers missing offsets from neighbouring photos within 48 hours, and writes `takenAtKey` so the `TakenAtIndex` GSI fills.
6. **Validate in the app:** summary counts per year, a busy month, the scrubber, one delete, and an upload landing in the right month.

## Lessons

- Treat an offset of exactly `+00:00` from a sidecar as *unknown*, not as UTC.
- Keep the pre-migration value of anything you rewrite (`takenAtOriginal`) so the change can be reversed.
- Orphan rows (row written, upload failed) show up as broken tiles; clean them up with a scan that HEADs each key.
