import csv
import json
import re
import sys
from datetime import datetime
import time

import requests

# ── Constants ────────────────────────────────────────────────────────────────
BASE_URL      = "https://ethical-idea-cea9193cdc.strapiapp.com"
BEARER_TOKEN  = "9fd53dbaf3d990dd529ce0e15b0c5330c880f124e9fd3755f2a6fdc3b24e6add635a7902f2cfe24a4fa7af19a8f4d23304a36bf7108b99229a4d591196062ac912d3175b52b4d678b2bc7d801dafdd8e0a8e0ec6a18f21cccae7b631e3ed089414736143b87dd3e0579429a70f7be5e6ff93d366da0cb442bdb289c1d3ac27f7"
EVENT_DOC_ID  = "qzniiq8efdhtkw6c97liu5sl"
CSV_PATH      = "RMGX_experiences.csv"

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_all(endpoint: str) -> list[dict]:
    """Fetch every page of a Strapi collection and return the flat list of items."""
    items = []
    page = 1
    page_size = 100
    while True:
        resp = requests.get(
            f"{BASE_URL}{endpoint}",
            headers=HEADERS,
         #   params={"pagination[page]": page, "pagination[pageSize]": page_size},
        )
        resp.raise_for_status()
        body = resp.json()
        data = body.get("data", [])
        items.extend(data)
        meta = body.get("meta", {}).get("pagination", {})
        total_pages = meta.get("pageCount", 1)
        if page >= total_pages:
            break
        page += 1
    return items


def slugify(value: str) -> str:
    """Lowercase and replace any run of non-alphanumeric chars with a hyphen."""
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value


def parse_date(value: str) -> str:
    """Convert MM/DD/YYYY → YYYY-MM-DD."""
    return datetime.strptime(value.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")


def parse_time(value: str) -> str:
    """Convert H:MM AM/PM or HH:MM AM/PM → HH:MM:SS (24-hour)."""
    value = value.strip()
    # Try 12-hour format first
    for fmt in ("%I:%M %p", "%I:%M%p"):
        try:
            return datetime.strptime(value, fmt).strftime("%H:%M:%S")
        except ValueError:
            pass
    # Fall back to assuming already 24-hour (HH:MM)
    try:
        return datetime.strptime(value, "%H:%M").strftime("%H:%M:%S")
    except ValueError:
        print(f"  [WARN] Could not parse time '{value}', using as-is", file=sys.stderr)
        return value


def split_names(value: str) -> list[str]:
    """Split an instructor string like 'Jane Doe, John Smith & Amy Lee' into individual names."""
    parts = re.split(r"[,&]", value)
    return [p.strip() for p in parts if p.strip()]


# ── Build lookup maps ─────────────────────────────────────────────────────────

def build_venue_map() -> dict[str, str]:
    print("Fetching venue locations…")
    items = fetch_all("/api/venue-locations")
    venue_map = {}
    for item in items:
        name = item.get("venue_location_name", "")
        doc_id = item.get("documentId", "")
        if name:
            venue_map[name] = doc_id
    print(f"  → {len(venue_map)} venue locations loaded")
    return venue_map


def build_instructor_map() -> dict[str, str]:
    print("Fetching instructors…")
    items = fetch_all("/api/instructors")
    instructor_map = {}
    for item in items:
        first = item.get("instructor_first_name", "") or ""
        last  = item.get("instructor_last_name", "")  or ""
        full  = f"{first} {last}".strip()
        doc_id = item.get("documentId", "")
        if full:
            instructor_map[full] = doc_id
    print(f"  → {len(instructor_map)} instructors loaded")
    return instructor_map


def build_tier_map() -> dict[str, str]:
    print("Fetching user tiers…")
    items = fetch_all("/api/user-tiers")
    tier_map = {}
    for item in items:
        # Try common field names for the tier name
        name = (
            item.get("user_tier_name")
            or item.get("tier_name")
            or item.get("name")
            or ""
        )
        doc_id = item.get("documentId", "")
        if name:
            tier_map[name] = doc_id
    print(f"  → {len(tier_map)} user tiers loaded")
    return tier_map


# ── Row → payload ─────────────────────────────────────────────────────────────

def build_payload(
    row: dict,
    venue_map: dict,
    instructor_map: dict,
    tier_map: dict,
) -> dict | None:
    name = row.get("experience_name", "").strip()
    if not name:
        print("  [SKIP] Empty experience_name, skipping row", file=sys.stderr)
        return None

    raw_date  = row.get("experience_start_date", "").strip()
    raw_start = row.get("experience_start_time", "").strip()
    raw_end   = row.get("experience_end_time", "").strip()

    try:
        start_date = parse_date(raw_date)
    except ValueError:
        print(f"  [WARN] Bad date '{raw_date}' for '{name}', skipping row", file=sys.stderr)
        return None

    start_time = parse_time(raw_start) if raw_start else "00:00:00"
    end_time   = parse_time(raw_end)   if raw_end   else "00:00:00"

    # Build experience_id from composite slug
    exp_id = slugify(name + start_date + start_time + EVENT_DOC_ID)

    # Venue location
    venue_name = row.get("experience_venue_location", "").strip()
    venue_doc_id = venue_map.get(venue_name)
    if venue_name and not venue_doc_id:
        print(f"  [WARN] Venue '{venue_name}' not found in map for '{name}'", file=sys.stderr)

    # Instructors
    instructor_str = row.get("experience_instructors", "").strip()
    instructor_docs = []
    if instructor_str:
        for instr_name in split_names(instructor_str):
            doc_id = instructor_map.get(instr_name)
            if doc_id:
                instructor_docs.append({"documentId": doc_id})
            else:
                print(f"  [WARN] Instructor '{instr_name}' not found in map for '{name}'", file=sys.stderr)

    # User tiers
    tier_str = row.get("experience_valid_user_tiers", "").strip()
    tier_docs = []
    if tier_str:
        for tier_name in [t.strip() for t in tier_str.split(",") if t.strip()]:
            doc_id = tier_map.get(tier_name)
            if doc_id:
                tier_docs.append({"documentId": doc_id})
            else:
                print(f"  [WARN] User tier '{tier_name}' not found in map for '{name}'", file=sys.stderr)

    # Boolean — note the CSV column has a typo ("puchase")
    req_purchase_raw = row.get("experience_requires_additional_puchase", "FALSE").strip().upper()
    req_purchase = req_purchase_raw == "TRUE"

    data: dict = {
        "experience_name": name,
        "experience_id": exp_id,
        "experience_start_date": start_date,
        "experience_start_time": start_time,
        "experience_end_time": end_time,
        "experience_type": row.get("experience_type", "").strip(),
        "experience_requires_additional_purchase": req_purchase,
        "experience_external_linking_id": row.get("experience_external_linking_id", "").strip(),
        "experience_description": row.get("experience_description", "").strip(),
        "experience_instructors": instructor_docs,
        "experience_event": [{"documentId": EVENT_DOC_ID}],
    }

    # Optional fields
    division = row.get("experience_competition_division", "").strip()
    if division:
        data["experience_competition_division"] = division

    if venue_doc_id:
        data["experience_venue_location"] = [{"documentId": venue_doc_id}]

    if tier_docs:
        data["experience_valid_user_tiers"] = tier_docs

    return {"data": data}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
   
    venue_map      = build_venue_map()
    instructor_map = build_instructor_map()
    tier_map       = build_tier_map()

    print("\nProcessing CSV…\n")
    print(venue_map)
    print(instructor_map)
    print(tier_map)

    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    success_count = 0
    error_count   = 0

    for i, row in enumerate(rows, start=1):
        name = row.get("experience_name", "").strip() or f"<row {i}>"
        print(f"── Row {i}: {name}")

        payload = build_payload(row, venue_map, instructor_map, tier_map)
        if payload is None:
            error_count += 1
            continue

        # Print JSON to terminal
        print(json.dumps(payload, indent=2))

        # POST to Strapi
        resp = requests.post(
            f"{BASE_URL}/api/experiences",
            headers=HEADERS,
            json=payload,
        )

        if resp.status_code in (200, 201):
            doc_id = resp.json().get("data", {}).get("documentId", "?")
            print(f"  [OK] Created → documentId: {doc_id}\n")
            success_count += 1
        else:
            print(f"  [ERROR] {resp.status_code}: {resp.text}\n", file=sys.stderr)
            error_count += 1

    print(f"\nDone. {success_count} created, {error_count} failed/skipped.")


if __name__ == "__main__":
    main()
