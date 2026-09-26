#!/usr/bin/env python3
"""
Backfill `takenAtKey` (and a corrected `takenAt`) on every MediaMetadata item so the
Vault timeline can page through a user's library in taken-date order.

Why `takenAt` needs correcting as well as indexing
--------------------------------------------------
`process_media.py` stored `takenAt` as `<naive datetime><suffix>` where the *naive* part
means different things depending on where the date came from, and the suffix is the EXIF
timezone offset (which describes the camera's local zone, not the naive value):

  dateSource   real tzOffset?   naive part is   local wall clock is
  -----------  ---------------  --------------  ---------------------
  exif         yes / no         LOCAL           naive                (EXIF DateTimeOriginal)
  video-tag    yes              LOCAL           naive                (Apple quicktime creationdate)
  video-tag    no               UTC             naive + offset       (mp4 creation_time)
  takeout      yes / no         UTC             naive + offset       (sidecar photoTakenTime epoch)
  mtime        yes / no         UTC             naive + offset       (file mtime)
  (absent)     -                no takenAt      createdAt (upload time)

So a Takeout photo shot at 16:08 Kyiv time is stored as `2022-10-23T13:08:46+03:00` —
right instant, wrong wall clock. Verified against the real S3 objects: that file's EXIF
DateTimeOriginal is `2022:10:23 16:08:46` with OffsetTimeOriginal `+03:00`.

After this script the invariant is simple and is what the UI relies on:

    the naive part of `takenAt` is ALWAYS the local wall clock the shutter fired at,
    and `takenAtKey` = "<YYYYMMDDTHHMMSS of that wall clock>#<sha1(mediaId)[:8]>".

`tzOffset` of exactly "+00:00" is treated as *unknown*: the Takeout sidecar path wrote it
as a placeholder for every item, and the library owner never lived in UTC+0.

Timezone inference
------------------
Many items have no real offset. Where a neighbouring photo (same phone, same trip)
taken within `--max-infer-gap-hours` does have one, we borrow it; `tzSource` records that as
"inferred". This moves a meaningful share of photos onto the correct calendar day. Disable with --no-infer-tz.

Idempotent: items that already have `takenAtKey` are skipped unless --force.
Reversible: whenever `takenAt` changes, the previous value is kept in `takenAtOriginal`.

Usage:
    AWS_PROFILE=<profile> python3 backfill_taken_at.py --dry-run
    AWS_PROFILE=<profile> python3 backfill_taken_at.py
"""
import argparse
import bisect
import collections
import concurrent.futures as futures
import datetime as dt
import hashlib
import json
import re
import sys
import threading

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

OFFSET_RE = re.compile(r"^[+-]\d{2}:\d{2}$")

# dateSource values whose naive datetime is already the local wall clock
NAIVE_IS_LOCAL = {"exif"}


def parse_offset(off):
    """'-06:00' -> timedelta. Returns None for missing/malformed/placeholder offsets."""
    if not off or off == "+00:00" or not OFFSET_RE.match(off):
        return None
    sign = 1 if off[0] == "+" else -1
    return sign * dt.timedelta(hours=int(off[1:3]), minutes=int(off[4:6]))


def fmt_offset(delta):
    total = int(delta.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    return f"{sign}{total // 3600:02d}:{(total % 3600) // 60:02d}"


def parse_naive(iso):
    """First 19 chars of an ISO string -> naive datetime, or None."""
    if not iso or len(iso) < 19:
        return None
    try:
        return dt.datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None


def s(item, key):
    return item.get(key, {}).get("S")


class Item:
    """One MediaMetadata row, resolved to a local wall clock."""

    __slots__ = ("user", "media_id", "taken_at", "date_source", "tz_offset",
                 "utc", "offset", "local", "tz_source", "changed")

    def __init__(self, raw):
        self.user = raw["userId"]["S"]
        self.media_id = raw["mediaId"]["S"]
        self.taken_at = s(raw, "takenAt")
        self.date_source = s(raw, "dateSource")
        self.tz_offset = parse_offset(s(raw, "tzOffset"))
        self.tz_source = None
        self.local = None
        self.changed = False

        naive = parse_naive(self.taken_at)
        if naive is None:
            # App uploads: no capture date at all, fall back to the upload timestamp (UTC).
            naive = parse_naive(s(raw, "createdAt"))
            self.date_source = "upload"

        if naive is None:
            self.utc = self.offset = None
            return

        if self.date_source in NAIVE_IS_LOCAL or (self.date_source == "video-tag" and self.tz_offset):
            # naive is local; derive the instant so this item can still lend its offset out
            self.offset = self.tz_offset
            self.utc = naive - self.tz_offset if self.tz_offset else naive
            self.local = naive
            self.tz_source = "exif" if self.tz_offset else "none"
        else:
            # naive is UTC; the local wall clock needs the offset added
            self.utc = naive
            self.offset = self.tz_offset
            if self.tz_offset:
                self.local = naive + self.tz_offset
                self.tz_source = "exif"
            # else: left for the inference pass

    @property
    def resolved(self):
        return self.local is not None

    def apply_inferred(self, offset):
        self.local = self.utc + offset
        self.offset = offset
        self.tz_source = "inferred"

    def finish(self):
        """Fall back to treating the UTC instant as the wall clock."""
        if self.local is None and self.utc is not None:
            self.local = self.utc
            self.tz_source = "none"

    def new_taken_at(self):
        suffix = fmt_offset(self.offset) if self.offset else "Z"
        return self.local.strftime("%Y-%m-%dT%H:%M:%S") + suffix

    def taken_at_key(self):
        h = hashlib.sha1(self.media_id.encode("utf-8")).hexdigest()[:8]
        return f"{self.local:%Y%m%dT%H%M%S}#{h}"


def infer_offsets(items, max_gap):
    """Borrow the offset of the nearest-in-time item that has a real one."""
    donors = sorted((i.utc, i.offset) for i in items if i.offset and i.utc)
    if not donors:
        return
    times = [d[0] for d in donors]
    for it in items:
        if it.resolved or it.utc is None:
            continue
        pos = bisect.bisect_left(times, it.utc)
        best = None
        for j in (pos - 1, pos):
            if 0 <= j < len(donors):
                gap = abs((times[j] - it.utc).total_seconds())
                if best is None or gap < best[0]:
                    best = (gap, donors[j][1])
        if best and best[0] <= max_gap:
            it.apply_inferred(best[1])


def scan(ddb, table, user):
    paginator = ddb.get_paginator("scan")
    kwargs = dict(
        TableName=table,
        ProjectionExpression="userId,mediaId,takenAt,createdAt,dateSource,tzOffset,takenAtKey",
    )
    for page in paginator.paginate(**kwargs):
        for raw in page["Items"]:
            if user and raw["userId"]["S"] != user:
                continue
            yield raw


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--table", default="MediaMetadata")
    ap.add_argument("--region", default="us-east-2")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--user", default=None, help="only this Cognito sub")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="rewrite items that already have takenAtKey")
    ap.add_argument("--no-infer-tz", action="store_true")
    ap.add_argument("--max-infer-gap-hours", type=float, default=48.0)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--report", default="backfill_report.jsonl")
    args = ap.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    ddb = session.client("dynamodb", config=Config(retries={"max_attempts": 10, "mode": "adaptive"}))

    print("Scanning …", flush=True)
    raws = list(scan(ddb, args.table, args.user))
    already = sum(1 for r in raws if "takenAtKey" in r)
    print(f"  {len(raws)} items ({already} already have takenAtKey)")

    by_user = collections.defaultdict(list)
    for raw in raws:
        by_user[raw["userId"]["S"]].append(Item(raw))

    max_gap = args.max_infer_gap_hours * 3600
    for user, items in by_user.items():
        if not args.no_infer_tz:
            infer_offsets(items, max_gap)
        for it in items:
            it.finish()

    todo = []
    for user, items in by_user.items():
        for it in items:
            if it.local is None:
                continue
            it.changed = it.new_taken_at() != it.taken_at
            todo.append(it)

    skip_existing = {r["mediaId"]["S"] for r in raws if "takenAtKey" in r} if not args.force else set()
    work = [it for it in todo if it.media_id not in skip_existing]

    stats = collections.Counter()
    years = collections.Counter()
    for it in todo:
        stats[f"tzSource={it.tz_source}"] += 1
        stats[f"dateSource={it.date_source}"] += 1
        if it.changed:
            stats["takenAt-changed"] += 1
            if it.new_taken_at()[:10] != (it.taken_at or "")[:10]:
                stats["date-moved-to-another-day"] += 1
        years[it.local.year] += 1

    print("\nResolved:")
    for k, v in sorted(stats.items()):
        print(f"  {k:34s} {v}")
    print("  years:", dict(sorted(years.items())))
    print(f"\n{len(work)} items to write ({len(todo) - len(work)} skipped: already keyed)")

    with open(args.report, "w") as fh:
        for it in todo:
            fh.write(json.dumps({
                "mediaId": it.media_id, "was": it.taken_at, "now": it.new_taken_at(),
                "key": it.taken_at_key(), "dateSource": it.date_source, "tzSource": it.tz_source,
                "changed": it.changed,
            }) + "\n")
    print(f"Report written to {args.report}")

    if args.dry_run:
        print("\n-- dry run, nothing written --")
        for it in work[:5]:
            print(f"  {it.media_id.split('/')[-1][:44]:46s} {it.taken_at} -> {it.new_taken_at()}  key={it.taken_at_key()}  tz={it.tz_source}")
        return

    if not work:
        print("Nothing to do.")
        return

    lock = threading.Lock()
    done = collections.Counter()

    def write(it):
        names = {"#k": "takenAtKey", "#t": "takenAt", "#ds": "dateSource", "#ts": "tzSource"}
        values = {
            ":k": {"S": it.taken_at_key()},
            ":t": {"S": it.new_taken_at()},
            ":ds": {"S": it.date_source or "unknown"},
            ":ts": {"S": it.tz_source or "none"},
        }
        sets = ["#k = :k", "#t = :t", "#ds = :ds", "#ts = :ts"]
        if it.changed and it.taken_at:
            names["#o"] = "takenAtOriginal"
            values[":o"] = {"S": it.taken_at}
            sets.append("#o = if_not_exists(#o, :o)")
        kwargs = dict(
            TableName=args.table,
            Key={"userId": {"S": it.user}, "mediaId": {"S": it.media_id}},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
        if not args.force:
            kwargs["ConditionExpression"] = "attribute_not_exists(takenAtKey)"
        try:
            ddb.update_item(**kwargs)
            with lock:
                done["ok"] += 1
        except ClientError as e:
            code = e.response["Error"]["Code"]
            with lock:
                done["raced" if code == "ConditionalCheckFailedException" else f"error:{code}"] += 1
                if code != "ConditionalCheckFailedException":
                    print(f"  ! {it.media_id}: {e}", file=sys.stderr)

    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for n, _ in enumerate(pool.map(write, work), 1):
            if n % 1000 == 0:
                print(f"  {n}/{len(work)} …", flush=True)

    print("\nWrite results:", dict(done))


if __name__ == "__main__":
    main()
