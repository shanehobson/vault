# Design: photos-by-date timeline

Status: **implemented.** The plan is kept as written; the section at the end records where the implementation deviated and why.

## Goal

Replace the flat, endless grid with a date-aware library like iPhone Photos / Google Photos:

- Photos grouped under **month headers** ("August 2026"), optionally day sub-headers ("Sat 23 Aug").
- A **Years / Months / All** zoom hierarchy: tap a year → its months, tap a month → its photos.
- A **fast scrubber** on the right edge showing the year/month under the thumb while dragging.
- Everything ordered by **when the photo was taken**, not when it was uploaded.
- Selection / delete / viewer modal keep working unchanged.

## What exists today (relevant facts)

Frontend (`src/`):
- `useFiles.ts` — `GET /media?userId&limit=25&cursor` → appends to a flat `files[]`, infinite scroll (`Infinite-Scroll.tsx`).
- `FileGrid.tsx` — one `GridContainer` of `Thumbnail`s; `FileData` already carries `takenAt?`, `thumbUrl?`, `width/height` (uncommitted diff).
- `MediaModal.tsx` — shows `takenAt` caption (uncommitted diff). `useFileSelection.ts` — selection by `mediaId`.
- `Upload.tsx` — names files `<uuid>.<ext>`, `POST /media`, PUT to presigned URL. **No date metadata sent.**

Backend (at the time, only in the AWS console; now in `backend/`):
- DynamoDB `MediaMetadata`: PK `userId`, SK `mediaId` (= S3 key `uploads/<sub>/<fileName>`), GSI `TimestampIndex` on `uploadTimestamp` (unused).
- `getMedia` queries the PK with `ScanIndexForward:false` → **order is by S3 key**, which only happens to be chronological for migrated files (named `YYYYMMDD_HHMMSS_<hash>_<name>`). App uploads are `<uuid>` → random order, interleaved.
- Migrated items have `takenAt`, `createdAt` (= taken date), `tzOffset`, `width`, `height`, `durationSec`. Items uploaded via the app have only `createdAt = upload time`.
- `postMedia` writes the DynamoDB row *before* the upload, from `{fileName, fileType}` only.

**Core problem:** there is no index that lets us page through a user's media in taken-date order, and app-uploaded files have no taken date at all. The UI work is straightforward once those two are fixed, so the plan is backend-first.

## Design decisions

1. **Single "timeline date" per item: `takenAt`** (ISO 8601 with offset, e.g. `2024-07-04T14:03:22-05:00`). Fallback chain: EXIF `DateTimeOriginal` → video `creation_time` → file `lastModified` → upload time. Store `dateSource` so we can show "approximate" later. Group by the **local wall-clock date** of `takenAt` (ignore the offset when bucketing: a photo taken 23:30 in Kyiv belongs to that Kyiv day), exactly what iOS does.
2. **Sortable key: `takenAtKey`** = `YYYYMMDDTHHMMSS#<mediaId-hash8>` (string, local wall-clock time). Used as a GSI sort key; the hash suffix keeps it unique.
3. **New GSI on `MediaMetadata`: `TakenAtIndex`** — PK `userId`, SK `takenAtKey`, projection ALL. Query it with `ScanIndexForward:false` for newest-first paging, and with `KeyCondition userId = :u AND takenAtKey BETWEEN :from AND :to` for "give me one month".
4. **A cheap summary endpoint** (`GET /media/summary`) returns counts per year/month for the user. This drives the Years/Months views and the scrubber without loading every item. Computed by paging the GSI with `ProjectionExpression takenAtKey` (1 KB/item ≈ cheap; ~20k items ≈ 20 RCU of reads, ~0.5 s) and cached client-side. If it ever gets slow, maintain counters via a DynamoDB Stream; not needed now.
5. **Month view = the "All Photos" unit of paging.** The client loads a month at a time (`from/to` on the list endpoint, cursor for very large months) rather than a fixed 25 items. Headers render from the summary immediately (skeleton grid sized from counts × known aspect ratios), so scrolling/scrubbing to 2019 is instant even before those thumbnails are fetched.
6. **Client-side date extraction on upload** (`exifr` library, ~20 KB): read `DateTimeOriginal`, `OffsetTimeOriginal`, GPS, dimensions in the browser and send them with `POST /media`. No server-side image processing needed for the timeline. (Server-side thumbnail generation for new uploads is a separate, known gap.)

## Phase 1 — Backend data model

**1a. Backfill script** (Python, run locally with an AWS profile, idempotent):
- Scan `MediaMetadata`; for every item without `takenAtKey`:
  - `takenAt` present → derive `takenAtKey` from its local wall-clock part.
  - else (app uploads): use `createdAt`, set `dateSource = "upload"`. *(Optional, nicer: for these ~few app-uploaded objects, download and read EXIF — reuse `process_media.py` helpers — and set real `takenAt`/`thumbnails/`.)*
- `UpdateItem` with `SET takenAt, takenAtKey, dateSource if_not_exists`.
- Also skip/flag orphan rows (no S3 object) — already a known cleanup item (B9).

**1b. Add GSI `TakenAtIndex`** (`aws dynamodb update-table --global-secondary-index-updates …`, PK `userId` S, SK `takenAtKey` S, ProjectionType ALL). Backfill can run before or after; the GSI backfills itself from items.

**1c. `postMedia`** — accept optional per-file `takenAt`, `latitude`, `longitude`, `width`, `height`, `durationSec`, `cameraMake/Model`, `originalName`; validate (ISO date, numbers in range, strings ≤ 256); write them + `takenAtKey` + `dateSource`. Fallback when absent: `takenAt = now`, `dateSource = "upload"`.

**1d. `getMedia`** — new query params:
- `order=taken` (default once the UI ships) → query `TakenAtIndex`, `ScanIndexForward:false`.
- `from=YYYYMMDD`, `to=YYYYMMDD` → `BETWEEN :from AND :to~` on `takenAtKey` (`~` sorts after digits; use `to + "T235959#~"`).
- keep `limit`/`cursor` semantics (cursor = base64 `LastEvaluatedKey`, which now includes the GSI keys — opaque to client, no change).
- Response items add `takenAt`, `dateSource`, `width`, `height` (already returned when present).
- Keep old behaviour when `order` is absent so the deployed frontend doesn't break mid-rollout.

**1e. New Lambda/route `GET /media/summary?userId`** → `{ years: [{ year: 2026, count, months: [{ month: 8, count, firstKey, lastKey }] }] , total }`, newest first. Reads the GSI with `ProjectionExpression: takenAtKey` in a paging loop; aggregate in memory. `Cache-Control: private, max-age=60`. Also reuse API Gateway auth (Cognito authorizer) like the other routes.

**1f. `deleteMedia`** — no change (deletes by `mediaId`; GSI updates automatically).

## Phase 2 — Frontend data layer

- `src/types/media.ts` — single `FileData` type (currently duplicated in 3 files); add `takenAt`, `dateSource`, `width`, `height`.
- `src/utils/dates.ts` — `localDateParts(takenAt)` (parse wall-clock without applying browser TZ), `monthKey("2026-08")`, `dayKey`, `formatMonth`, `formatDay` (Intl.DateTimeFormat, relative "Today/Yesterday" for day headers).
- `useApiClient.ts` — add `getSummary()`, `listMedia({from,to,cursor,limit})`.
- **New `useLibrary()` hook** replacing `useFiles()` for the timeline page:
  - state: `summary` (from `/media/summary`), `monthsLoaded: Map<monthKey, { files, cursor, done }>`, `loadingMonths: Set`.
  - `ensureMonth(monthKey)` — fetches that month (`from=YYYYMM01&to=YYYYMM31`, limit 200, follow cursor until done).
  - `ensureMonthsAround(monthKey, ±1)` for prefetching.
  - `removeFiles(ids)` — used after delete; also decrements summary counts.
  - `addFiles(files)` — after upload, insert into the right month bucket (so a fresh upload appears in the right place without a full reload).
  - Keep `useFiles()` around only until `ViewFiles` is switched over; then delete it and `Paginator.tsx` if unused.
- Persist last zoom level + last scroll month in `sessionStorage` so back-navigation from Upload restores position.

## Phase 3 — UI

Route structure (react-router): `/` → `<Library />` with an in-page zoom state rather than three routes (iOS keeps it as one screen with a segmented control). Query param `?m=2026-08` for deep-linking a month.

**3a. Zoom segmented control** (`components/library/ZoomControl.tsx`): `Years · Months · All`, sticky at the bottom on mobile / top-right on desktop, matching iOS's pill. Switching zoom is animated (fade + scale) but keeps the *same anchor date* so the user doesn't lose their place (Years→Months expands the year that contained the anchor; Months→All scrolls to that month's header).

**3b. Years view** (`YearsView.tsx`): one large tile per year, newest first, showing a cover thumbnail (the newest `thumbUrl` in that year; fetched lazily via `listMedia({from,to,limit:1})`) with the year overlaid bottom-left and count top-right. Tap → Months view scrolled to that year.

**3c. Months view** (`MonthsView.tsx`): year headers, then a tile per month (cover thumbnail + "August 2026 · 143"). Tap → All view scrolled to that month. Cover fetch same as years (1 request per visible month, cached).

**3d. All view** (`TimelineGrid.tsx`) — the main grid:
- Rendered as a virtualised list of **sections** (one section per month, day sub-headers inside when a month has > ~60 items — iOS shows day headers in "All Photos" only at the closest zoom; we'll use month headers always, day headers optional behind a setting).
- Each section: sticky header (`<h2>August 2026</h2>`, count, "Select" affordance) + a CSS grid of square tiles (`aspect-ratio: 1; object-fit: cover`), 3 columns on phone, up to 8 on desktop; pinch/ctrl+wheel changes column count (nice-to-have).
- **Virtualisation**: sections have a known height from the summary (`ceil(count / cols) * tileSize + headerHeight`) so total scroll height is exact before any month is fetched. Use `@tanstack/react-virtual` (`useVirtualizer` with `estimateSize` per section, `measureElement` for corrections). A section entering the viewport (±1 screen) calls `ensureMonth`; until data arrives it renders skeleton tiles. This replaces `DeferredRender` + `Infinite-Scroll.tsx` for this page.
- Tiles reuse today's `MediaThumb` (thumbUrl → fallback), play icon + duration badge (`durationSec` → `0:42`) for videos, selection checkbox as today.
- Thumbnail heights: `useThumbnailHeight` becomes unnecessary once tiles are `aspect-ratio: 1`.

**3e. Scrubber** (`Scrubber.tsx`): a thin rail on the right; while dragging, a bubble shows "Aug 2026"; releasing scrolls to that month's section offset (computed from summary heights, no data needed). Tick marks at year boundaries. Also updates as you scroll normally (like iOS/Google Photos). Touch + mouse.

**3f. Selection & delete**: `useFileSelection` unchanged in spirit; move to `mediaId` set (it's an array today — `includes` on each tile is O(n)). Add per-section "Select all" on the month header (iOS has it). After delete, `useLibrary.removeFiles` updates buckets + counts; sections shrink in place.

**3g. Viewer modal**: unchanged, plus ←/→ navigation across the flat ordered list (concat of loaded months) — small addition, high value.

**3h. Empty/edge states**: no photos (CTA to upload), month with 0 loaded due to error (retry button in section), items with `dateSource: "upload"` show a subtle "date unknown" hint in the modal caption.

## Phase 4 — Upload with metadata

- `Upload.tsx`: for each file, `exifr.parse(file, { pick: ['DateTimeOriginal','OffsetTimeOriginal','GPSLatitude','GPSLongitude','Make','Model','ExifImageWidth','ExifImageHeight','Orientation'] })` for images; for videos use `file.lastModified` (browser can't read QuickTime `creation_time` cheaply — acceptable; MOV from iPhone also often has correct `lastModified`). HEIC: `exifr` reads HEIC EXIF fine.
- Send these fields to `POST /media` (the DynamoDB row now has `takenAt` before the object even lands).
- After upload, `navigate("/?m=YYYY-MM")` for the month of the newest uploaded item so the user sees them.
- Show taken dates in the upload list before confirming (small UX win, cheap).

## Phase 5 — Rollout order

1. Backfill script + GSI (1a, 1b) — safe, additive, no user-visible change.
2. Deploy `postMedia` + `getMedia` (backwards compatible) + new `summary` Lambda/route (1c–1e). Old frontend keeps working.
3. Frontend Phases 2–4 behind nothing (small app, one user) — deploy with `./deploy.sh`.
4. Verify against a real library (tens of thousands of items): summary latency, month load latency, scrubber accuracy, delete, upload → appears in the right month.
5. Remove `useFiles`, `Paginator`, `Infinite-Scroll`, `useThumbnailHeight` if no longer referenced.

## Risks / open points

- **Timezone correctness**: migrated `takenAt` carries `tzOffset` when EXIF had it; otherwise it's stored as `Z` even though it's really local wall-clock. Bucketing by the *string's* date portion (not `new Date()` → browser TZ) avoids off-by-one-day shifts. `MediaModal.formatTaken` currently uses `new Date(iso).toLocaleString()` — should switch to the same wall-clock formatting.
- **Summary cost at scale**: fine for tens of thousands of items; revisit (stream-maintained counters) only if it exceeds ~1 s.
- **GSI + cursor**: `LastEvaluatedKey` on a GSI query includes both table and index keys — cursor stays opaque, but *old cursors from the base-table query are invalid on the GSI*; the client discards cursors on reload anyway.
- **postMedia writes rows before upload** (orphans if the PUT fails) — pre-existing; timeline will show a skeleton/broken tile for orphans. Worth fixing separately (S3 `ObjectCreated` trigger or a client "confirm" call) — noted, not in scope.
- **Videos in the grid** currently fall back to a `<video>` element when no thumbnail exists (app uploads) — expensive. A thumbnail Lambda for new uploads is the real fix.
- **`limit` per month**: months with thousands of items (e.g. a trip) still page via cursor inside the section; virtualiser handles it.

## Files to touch (summary)

| Area | Files |
|---|---|
| Backend | `postMedia/index.mjs`, `getMedia/index.mjs`, new `getMediaSummary/index.mjs`, API Gateway route `GET /media/summary`, DynamoDB GSI, `backfill_taken_at.py` |
| Types/utils | `src/types/media.ts` (new), `src/utils/dates.ts` (new) |
| Data | `src/hooks/useApiClient.ts`, `src/hooks/useLibrary.ts` (new), remove `useFiles.ts` |
| UI | `src/pages/Library.tsx` (replaces `ViewFiles.tsx`), `src/components/library/{ZoomControl,YearsView,MonthsView,TimelineGrid,SectionHeader,Scrubber,MediaTile}.tsx`, `MediaModal.tsx` (prev/next, wall-clock date) |
| Upload | `src/pages/Upload.tsx`, `src/hooks/useGenerateUrls.ts` |
| Deps | `@tanstack/react-virtual`, `exifr` |

Rough effort: backend ~1 day, frontend ~2–3 days, polish (scrubber, zoom animation, keyboard nav) ~1 day.

---

---

# Outcome and deviations

Everything in the plan is built; the Lambda sources now live in `backend/` and `backend/deploy_lambdas.sh` deploys them with a backup of the previous code.

## The date bug the backfill also fixes

The plan assumed `takenAt`'s naive part was already local wall-clock time. It wasn't, for most of the library: the import pipeline took the date from the Takeout sidecar (a **UTC** epoch) and suffixed it with the camera's EXIF offset, so a photo shot at 16:08 in Kyiv was stored as `13:08:46+03:00`. Right instant, wrong wall clock. Verified against the actual S3 objects (that file's EXIF `DateTimeOriginal` really is `16:08:46` with `OffsetTimeOriginal +03:00`) and against an iPhone video, whose Apple `creationdate` tag *is* local and was stored correctly.

The backfill normalises everything to "naive part = local wall clock", the invariant the whole UI now depends on. Where an item had no real offset (Takeout wrote a `+00:00` placeholder) but a photo within 48 h did, the backfill borrows it and records `tzSource: "inferred"`; items with no neighbour keep UTC and are marked `tzSource: "none"`. The previous value is kept in `takenAtOriginal` wherever it changed, so this is reversible.

## Deviations from the plan

- **No separate summary Lambda or route.** The summary is `GET /media?mode=summary` on the existing Lambda. A new route would have meant a new function, a new IAM role, four API Gateway resources and a redeploy of the whole stage, for one read-only query shape. Same auth, same client, nothing else to keep in sync. The `Cache-Control` header the plan wanted isn't reachable through this non-proxy integration anyway; `useLibrary` caches the summary for the life of the page instead.
- **Row-level virtualisation, not section-level.** "One virtual item per month" breaks down on real data: a busy month holds hundreds of items and a single year can hold thousands. The library is flattened into one list of fixed-height rows (month header, tile rows, optional day headers) and that is what's virtualised. Measured: about 200 `<img>` in the DOM at any scroll depth, out of tens of thousands.
- **`useThumbnailHeight` / `measureElement` not used.** Row heights are computed exactly from the summary counts, so there is one source of truth for geometry and the scrubber agrees with the scrollbar. Verified at six scroll depths: zero overlaps, zero gaps.
- **`useLibrary.addFiles` dropped.** Upload navigates to `/?m=YYYY-MM`, which remounts the library and refetches the summary, so there was nothing for it to do.
- **Day sub-headers are a checkbox, default off.** With them on, a month's height is only exact once it has loaded, so sections below shift slightly as you scroll. With them off, every height is exact from the start.
- **`postMedia` trusts the browser's `file.type`** when it looks like `image/*` or `video/*`. The pre-signed PUT signs `Content-Type`, and the extension table had no HEIC entry, so an iPhone HEIC upload would 403 on the PUT.

## Verification

The date semantics were checked against real S3 objects; `takenAtKey` is identical across the backfill script, the Lambda and the generated report; 35 assertions cover the date and layout helpers; every `getMedia` query shape was run against the real table; and the timeline was driven in a browser against an 18k-item mock for virtualisation, sticky headers, selection, day headers and scrubber accuracy (0% positioning error at every rail position). That browser pass caught a bug that would have shipped: an Emotion component selector (`${Frame}:hover &`) that throws at runtime without `@emotion/babel-plugin`, which this Vite setup doesn't run.

### Delete confirmation (added after the plan)

There was no confirmation before delete, and `deleteMedia` is permanent: it removes the S3 object and the DynamoDB row, the bucket has no versioning, and the table has PITR disabled. The timeline made that sharper: a month header's "Select" can pick several hundred items in one tap.

`ConfirmDeleteDialog` now stands between the trash button and the API. It names the count ("Delete 413 items?"), focus lands on Cancel so a stray Enter can't destroy anything, and Escape/backdrop dismiss it, except while a delete is in flight, when both are ignored and the buttons disable.

**Still outstanding:** S3 versioning (plus a lifecycle rule to expire old versions after ~30 days) and DynamoDB PITR. A dialog stops deliberate mistakes; only those two make an accidental delete recoverable.
