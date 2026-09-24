#!/usr/bin/env python3
"""
Send an approved batch of outreach emails via the Resend API.

This script is deliberately the ONLY place that actually sends email in
this project. It requires an explicit --yes flag so it can never fire by
accident, reads content strictly from the body.txt/body.html files the
marketer agent produced (so what sends is exactly what was reviewed), and
updates the batch CSV's status column as it goes so re-runs don't
double-send.

Unlike the Gmail draft/send tools, Resend sends the HTML exactly as
given — no compose-layer stripping of <img> tags, so inline photos
(data: URIs or hosted URLs) in body.html actually render.

Usage:
    python3 scripts/send_via_resend.py data/draft-batch-2026-09-17.csv --yes
    python3 scripts/send_via_resend.py data/draft-batch-2026-09-17.csv --dry-run

Config: config/resend.env (copy config/resend.env.example and fill it in).
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(REPO_ROOT, "config", "resend.env")


def load_env(path):
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip()
    return values


def load_text_content(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    if not text.startswith("Subject:"):
        raise ValueError(f"{path} does not start with 'Subject:' — refusing to send")
    subject_line, _, body = text.partition("\n")
    subject = subject_line[len("Subject:"):].strip()
    body = body.lstrip("\n")
    if not subject or not body.strip():
        raise ValueError(f"{path} has an empty subject or body — refusing to send")
    return subject, body


def load_content_dir(content_dir):
    """Load subject/text/html from a data/drafts/<date>/<slug>/ directory."""
    txt_path = os.path.join(content_dir, "body.txt")
    html_path = os.path.join(content_dir, "body.html")
    subject, text_body = load_text_content(txt_path)
    html_body = None
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html_body = f.read()
        if not html_body.strip():
            raise ValueError(f"{html_path} is empty — refusing to send")
    return subject, text_body, html_body


def send_one(api_key, from_name, from_email, reply_to, to_email, subject, text_body, html_body):
    payload = {
        "from": f"{from_name} <{from_email}>",
        "to": [to_email],
        "reply_to": reply_to,
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return True, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}"
    except urllib.error.URLError as e:
        return False, str(e)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch_csv", help="Path to data/draft-batch-<date>.csv")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--yes", action="store_true", help="Actually send")
    action.add_argument("--dry-run", action="store_true", help="Print what would send, without sending")
    args = parser.parse_args()

    # Process environment variables (e.g. the cloud environment's settings)
    # take precedence over config/resend.env, so the API key never has to
    # be written to a file. From/reply-to fall back to the company address.
    env = {
        "RESEND_FROM_NAME": "Amanda Mataija | Prague Integration",
        "RESEND_FROM_EMAIL": "contact@pragueintegration.cz",
        "RESEND_REPLY_TO": "contact@pragueintegration.cz",
    }
    env.update(load_env(ENV_PATH))
    env.update({k: v for k, v in os.environ.items() if k.startswith("RESEND_") and v})
    for key in ("RESEND_API_KEY", "RESEND_FROM_NAME", "RESEND_FROM_EMAIL", "RESEND_REPLY_TO"):
        if not env.get(key):
            print(f"Missing {key}: set it as an environment variable or in config/resend.env", file=sys.stderr)
            sys.exit(1)
    rate = float(env.get("RESEND_RATE_PER_SECOND", "1") or "1")
    delay = 1.0 / rate if rate > 0 else 1.0

    if not os.path.exists(args.batch_csv):
        print(f"Batch file not found: {args.batch_csv}", file=sys.stderr)
        sys.exit(1)

    with open(args.batch_csv, "r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("Batch file is empty.")
        return
    fieldnames = list(rows[0].keys())
    if "status" not in fieldnames:
        fieldnames.append("status")

    sent, skipped, failed = 0, 0, 0
    for row in rows:
        if row.get("status", "").strip().lower() == "sent":
            skipped += 1
            continue
        content_dir = row.get("content_dir", "").strip()
        to_email = row.get("email", "").strip()
        if not content_dir or not to_email:
            row["status"] = "skipped: missing content_dir or email"
            skipped += 1
            continue

        content_path = content_dir if os.path.isabs(content_dir) else os.path.join(REPO_ROOT, content_dir)
        try:
            subject, text_body, html_body = load_content_dir(content_path)
        except (OSError, ValueError) as e:
            row["status"] = f"failed: {e}"
            failed += 1
            continue

        if args.dry_run:
            has_html = "with HTML" if html_body else "text-only"
            print(f"[dry-run] would send to {to_email} <{row.get('name', '')}> subject={subject!r} ({has_html})")
            continue

        ok, info = send_one(
            env["RESEND_API_KEY"], env["RESEND_FROM_NAME"], env["RESEND_FROM_EMAIL"],
            env["RESEND_REPLY_TO"], to_email, subject, text_body, html_body,
        )
        if ok:
            row["status"] = "sent"
            sent += 1
            print(f"sent -> {to_email}")
        else:
            row["status"] = f"failed: {info}"
            failed += 1
            print(f"FAILED -> {to_email}: {info}", file=sys.stderr)
        time.sleep(delay)

    if args.dry_run:
        print(f"\nDry run: {len(rows)} rows checked, nothing sent.")
        return

    with open(args.batch_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nDone: {sent} sent, {failed} failed, {skipped} skipped. Statuses written to {args.batch_csv}")
    if failed:
        sys.exit(2)


if __name__ == "__main__":
    main()
