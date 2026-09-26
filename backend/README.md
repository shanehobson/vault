# Vault backend

Three Lambdas behind an API Gateway REST API with a Cognito authorizer. They were originally created in the console; these files are the authoritative sources now. Edit here, then `./deploy_lambdas.sh`.

| Piece | What it is |
|---|---|
| `getMedia/index.mjs` | `GET /media`: list the caller's media, and `?mode=summary` for per-year/month counts |
| `postMedia/index.mjs` | `POST /media`: pre-signed PUT URLs plus the DynamoDB row, with capture metadata |
| `deleteMedia/index.mjs` | `DELETE /media`: removes S3 objects and rows, only under the caller's prefix |
| `backfill_taken_at.py` | one-off, idempotent: normalises `takenAt` and writes `takenAtKey` for an existing library |
| `deploy_lambdas.sh` | sets env vars, zips and deploys, backing up the previous code first |
| `apply_api_auth.sh` | installs the API Gateway mapping templates that inject the caller's identity |
| `apply_role_policy.sh` | grants the getMedia role access to the table, its indexes and the bucket |

Configuration comes from `../.env` (see `../.env.example`): account, region, bucket, table, role name, REST API id and stage. The Lambdas read `MEDIA_BUCKET` and `MEDIA_TABLE` from their environment; `deploy_lambdas.sh` sets them.

## Identity

The REST API uses **non-proxy** Lambda integrations: the Lambda receives exactly what the mapping template builds, and its return value is passed through as the response body (which is why the frontend reads `data.body`). The templates installed by `apply_api_auth.sh` add

```
"callerSub": "$context.authorizer.claims.sub"
```

to every event, and the Lambdas use that, and only that, as the `userId`. A client-supplied `userId` is ignored. `deleteMedia` additionally refuses any key outside `uploads/<callerSub>/`. Media keys are `uploads/<sub>/<fileName>`; thumbnails, when present, are `thumbnails/<sub>/<fileName>.jpg`.

## The date model

`MediaMetadata` items carry:

| Attribute | Meaning |
|---|---|
| `takenAt` | ISO 8601. **The naive part is always the local wall clock the shutter fired at**; the suffix is the camera's UTC offset when known, else `Z`. |
| `takenAtKey` | `YYYYMMDDTHHMMSS#<sha1(mediaId)[:8]>` of that wall clock, the sort key of the `TakenAtIndex` GSI. |
| `dateSource` | `takeout` / `exif` / `video-tag` / `mtime` / `upload`: where the date came from. |
| `tzSource` | `exif` (real offset), `inferred` (borrowed from a neighbouring photo), `none` (offset unknown, wall clock is UTC). |
| `takenAtOriginal` | the pre-backfill `takenAt`, kept only where the backfill changed it. |

Grouping is by the **wall-clock date**, not by instant: a photo taken at 23:30 in Kyiv belongs to that Kyiv day. That is why the naive part matters and the offset does not.

`TakenAtIndex` is a GSI on (`userId`, `takenAtKey`) projecting ALL. It is sparse: an item without `takenAtKey` is invisible to the timeline, so `postMedia` always writes one.

### Why the backfill also rewrites `takenAt`

An earlier import pipeline took the date from Google Takeout sidecars (a UTC epoch) and then suffixed it with the camera's EXIF offset, so a photo shot at 16:08 in Kyiv was stored as `13:08:46+03:00`: right instant, wrong wall clock. The backfill normalises everything to "naive part = local wall clock", the invariant the UI depends on. Where an item has no real offset but a photo within 48 hours does (same phone, same trip), the backfill borrows it and records `tzSource: "inferred"`. The previous value is kept in `takenAtOriginal`, so the change is reversible.

## Range queries

`takenAtKey` brackets a date range with characters that sort outside the hex hash:
`BETWEEN "20260801T000000#" AND "20260831T235959#~"` (`#` = 0x23 sorts below every digit, `~` = 0x7e above every hex character).

## Endpoints

```
GET /media?limit=&cursor=                  base table, newest first (legacy; still works)
GET /media?order=taken&limit=&cursor=      TakenAtIndex, newest capture date first
GET /media?from=YYYYMMDD&to=YYYYMMDD       one date range (implies order=taken)
GET /media?mode=summary                    { total, years: [{ year, count, months: [...] }] }
POST /media   { files: [{ fileName, fileType, takenAt?, tzOffset?, latitude?, longitude?,
                width?, height?, durationSec?, cameraMake?, cameraModel?, originalName?, dateSource? }] }
DELETE /media { mediaIds }
```

`mode=summary` fans the years out in parallel and reads only `takenAtKey`, so a library of tens of thousands of items costs roughly one round trip per MB of the biggest single year. If it ever gets slow, maintain the counters from a DynamoDB Stream instead.

## Setting up from scratch

1. Create the `MediaMetadata` table (PK `userId`, SK `mediaId`) and the `TakenAtIndex` GSI (PK `userId`, SK `takenAtKey`, projection ALL).
2. Create the three Lambdas (Node 20) and a REST API with a `/media` resource, `GET`/`POST`/`DELETE` methods using a Cognito user pool authorizer and non-proxy Lambda integrations.
3. `./apply_role_policy.sh`, then `./apply_api_auth.sh`, then `./deploy_lambdas.sh`.
4. For an existing library: `AWS_PROFILE=<profile> python3 backfill_taken_at.py --dry-run`, then without `--dry-run`.

Recommended, not yet done: S3 versioning with a lifecycle rule to expire old versions, and DynamoDB point-in-time recovery. The delete confirmation dialog stops deliberate mistakes; only those two make an accidental delete recoverable.
