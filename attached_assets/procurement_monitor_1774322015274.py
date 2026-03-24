#!/usr/bin/env python3
"""
=============================================================================
  PUBLIC SECTOR PROCUREMENT MONITOR
  Mines SAM.gov, state procurement portals, and budget signals to detect
  rebid opportunities for previously lost government RFx deals.
=============================================================================

  SETUP:
    1. Get a free SAM.gov API key:
       - Create account at https://sam.gov
       - Go to Profile > Account Details > Public API Key
       - Copy key into config.json (see below)

    2. Install dependencies:
       pip install requests beautifulsoup4 pandas openpyxl schedule

    3. Create config.json in the same directory (template generated on first run)

    4. Run:
       python procurement_monitor.py              # one-time scan
       python procurement_monitor.py --schedule    # run daily at 7am
       python procurement_monitor.py --backfill 90 # scan last 90 days

  OUTPUT:
    - Console alerts for matches
    - alerts.csv with all matches (appended on each run)
    - alerts.html for a visual dashboard
=============================================================================
"""

import os
import sys
import json
import csv
import re
import time
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from urllib.parse import urlencode

try:
    import requests
except ImportError:
    sys.exit("Missing 'requests' library. Run: pip install requests")

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # optional, used for state portal scraping

try:
    import pandas as pd
except ImportError:
    pd = None  # optional, used for Excel watchlist loading

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "config.json"
ALERTS_CSV = SCRIPT_DIR / "alerts.csv"
ALERTS_HTML = SCRIPT_DIR / "alerts_dashboard.html"
LOG_PATH = SCRIPT_DIR / "procurement_monitor.log"

DEFAULT_CONFIG = {
    "sam_api_key": "YOUR_SAM_GOV_API_KEY_HERE",
    "email_notifications": {
        "enabled": False,
        "smtp_server": "smtp.gmail.com",
        "smtp_port": 587,
        "sender_email": "",
        "sender_password": "",
        "recipients": []
    },
    "scan_window_days": 30,
    "match_threshold": 0.4,
    "naics_codes": [
        "541511",  # Custom Computer Programming Services
        "541512",  # Computer Systems Design Services
        "511210",  # Software Publishers
        "518210",  # Computing Infrastructure Providers / Data Processing
        "541519"   # Other Computer Related Services
    ],
    "search_keywords": [
        "electronic signature",
        "esignature",
        "e-signature",
        "digital signature",
        "contract lifecycle management",
        "contract management",
        "CLM",
        "document management",
        "DocuSign",
        "Adobe Sign"
    ],
    "state_portals": {
        "FL": "https://vendor.myfloridamarketplace.com",
        "OH": "https://procure.ohio.gov/proc/searchArchive.asp",
        "TX": "https://www.txsmartbuy.com",
        "CA": "https://caleprocure.ca.gov/pages/public-search.aspx",
        "PA": "https://www.emarketplace.state.pa.us",
        "MN": "https://mn.gov/admin/government/procurement-bids/",
        "IL": "https://www.bidbuy.illinois.gov",
        "MD": "https://emaryland.buyspeed.com",
        "GA": "https://ssl.doas.state.ga.us/PRSapp/PR_index.jsp",
        "NM": "https://www.generalservices.state.nm.us",
        "SD": "https://bids.sd.gov",
        "NC": "https://www.ips.state.nc.us",
        "NJ": "https://www.njstart.gov",
        "OK": "https://oklahoma.gov/omes/services/purchasing.html",
        "NV": "https://purchasing.nv.gov",
        "CT": "https://biznet.ct.gov/SCP_Search/Default.aspx",
        "MS": "https://www.contractsearch.ms.gov",
        "WY": "https://ai.wyo.gov/divisions/general-services/procurement",
        "PR": "https://www.asg.pr.gov"
    }
}

# ---------------------------------------------------------------------------
# Watchlist — your lost government deals to monitor
# ---------------------------------------------------------------------------
# This is pre-populated from your GPM Win/Loss data. Each entry includes
# the agency name, keywords to search for, estimated rebid window, and
# deal context. You can edit this list directly or load from Excel.

WATCHLIST = [
    # === TIER 1: IMMEDIATE (rebid window is NOW or very soon) ===
    {
        "agency": "Citizens Property Insurance",
        "search_terms": ["citizens property insurance", "citizens insurance esignature"],
        "state": "FL",
        "tcv": 704062,
        "reason": "No Decision / Project Delayed",
        "competitor": "Adobe",
        "rebid_window_start": "2025-04-01",
        "rebid_window_end": "2026-06-30",
        "priority": "HIGH",
        "notes": "Explicitly delayed to Q4 2024. Salesforce integration deal."
    },
    {
        "agency": "Ohio Department of Job & Family Services",
        "search_terms": ["ohio job family services", "ohio DJF", "ohio ODJFS esignature"],
        "state": "OH",
        "tcv": 606500,
        "reason": "No Decision / Project Delayed",
        "competitor": "Other",
        "rebid_window_start": "2025-11-01",
        "rebid_window_end": "2026-12-31",
        "priority": "HIGH",
        "notes": "Restarting from scratch. Previous team relationship was poor."
    },
    {
        "agency": "Minnesota Judicial Branch",
        "search_terms": ["minnesota judicial", "minnesota courts esignature", "MN courts"],
        "state": "MN",
        "tcv": 164419,
        "reason": "No Decision / Project Delayed",
        "competitor": "Adobe",
        "rebid_window_start": "2025-03-01",
        "rebid_window_end": "2026-06-30",
        "priority": "HIGH",
        "notes": "CIO deprioritized. Courts modernization wave happening nationwide."
    },
    {
        "agency": "Puerto Rico Judicial Branch",
        "search_terms": ["puerto rico judicial", "puerto rico ASG", "administracion servicios generales"],
        "state": "PR",
        "tcv": 206500,
        "reason": "No Decision / Project Delayed",
        "competitor": "Adobe",
        "rebid_window_start": "2025-07-01",
        "rebid_window_end": "2026-12-31",
        "priority": "HIGH",
        "notes": "Project delayed. Monitor SAM.gov and PR state portal."
    },
    {
        "agency": "Land Registers of Northern Ireland",
        "search_terms": ["land registers northern ireland", "LRNI"],
        "state": "INTL",
        "tcv": 165444,
        "reason": "No Decision / Project Delayed",
        "competitor": "Adobe",
        "rebid_window_start": "2025-10-01",
        "rebid_window_end": "2026-12-31",
        "priority": "HIGH",
        "notes": "Explicitly said 'will reopen at later date'. eSign+CLM+Identity."
    },

    # === TIER 2: PRICE LOSSES — 3-year contract expiry approaching ===
    {
        "agency": "Pôle Emploi / France Travail",
        "search_terms": ["pole emploi", "france travail", "esignature"],
        "state": "INTL",
        "tcv": 321177,
        "reason": "Price: License",
        "competitor": "DocaPost",
        "rebid_window_start": "2026-01-01",
        "rebid_window_end": "2028-04-30",
        "priority": "MEDIUM",
        "notes": "Lost on 50% price weighting. DocaPost 3yr contract expiry ~Apr 2026."
    },
    {
        "agency": "Transport Canada / Shared Services Canada",
        "search_terms": ["transport canada esignature", "shared services canada electronic signature"],
        "state": "INTL",
        "tcv": 85808,
        "reason": "Price: License",
        "competitor": "Nintex",
        "rebid_window_start": "2026-01-01",
        "rebid_window_end": "2028-05-31",
        "priority": "MEDIUM",
        "notes": "Nintex 3yr contract expiry ~May 2026. Federal contract via SSC."
    },
    {
        "agency": "South Dakota Department of Health",
        "search_terms": ["south dakota health", "south dakota contract management", "SD CLM"],
        "state": "SD",
        "tcv": 144000,
        "reason": "Price: License",
        "competitor": "IronClad",
        "rebid_window_start": "2026-06-01",
        "rebid_window_end": "2028-09-30",
        "priority": "MEDIUM",
        "notes": "Two CLM deals. IronClad 3yr expiry ~Sep 2026. Bundle with SD DHS."
    },
    {
        "agency": "South Dakota Department of Human Services",
        "search_terms": ["south dakota human services", "south dakota DHS CLM"],
        "state": "SD",
        "tcv": 60000,
        "reason": "Price: License",
        "competitor": "IronClad",
        "rebid_window_start": "2026-06-01",
        "rebid_window_end": "2028-09-30",
        "priority": "MEDIUM",
        "notes": "Same state as SD Health. Bundle approach."
    },
    {
        "agency": "Maryland State Department of Education",
        "search_terms": ["maryland education", "MSDE contract management", "maryland DOE CLM"],
        "state": "MD",
        "tcv": 50000,
        "reason": "Price: License",
        "competitor": "Will Not Disclose",
        "rebid_window_start": "2026-07-01",
        "rebid_window_end": "2028-10-31",
        "priority": "MEDIUM",
        "notes": "Already won MD Commerce and MD Labor. Leverage state relationships."
    },

    # === TIER 3: LARGE FUTURE REBIDS — start relationship building ===
    {
        "agency": "US Courts Defender Service Division",
        "search_terms": ["US courts esignature", "courts defender service", "judicial electronic signature"],
        "state": "DC",
        "tcv": 2335823,
        "reason": "Price: License",
        "competitor": "Madison Cloud",
        "rebid_window_start": "2027-01-01",
        "rebid_window_end": "2029-04-30",
        "priority": "WATCH",
        "notes": "Biggest single loss ($2.34M). Madison Cloud won. Start building now."
    },
    {
        "agency": "Florida Department of Children & Families",
        "search_terms": ["florida DCF", "florida children families", "FL DCF contract management"],
        "state": "FL",
        "tcv": 226981,
        "reason": "Price: Professional Services",
        "competitor": "Authorium",
        "rebid_window_start": "2027-06-01",
        "rebid_window_end": "2029-09-30",
        "priority": "WATCH",
        "notes": "Authorium 'low balled services and licensing'. Watch for complaints."
    },
    {
        "agency": "State of New Mexico CYFD",
        "search_terms": ["new mexico children youth", "new mexico CYFD", "NM CCWIS"],
        "state": "NM",
        "tcv": 184186,
        "reason": "Price: License",
        "competitor": "Adobe",
        "rebid_window_start": "2027-01-01",
        "rebid_window_end": "2029-01-31",
        "priority": "WATCH",
        "notes": "Lost via Accenture SI. Consider different SI partner path."
    },
    {
        "agency": "County of Allegheny",
        "search_terms": ["allegheny county", "allegheny DHS CLM", "allegheny contract management"],
        "state": "PA",
        "tcv": 127845,
        "reason": "Price: License",
        "competitor": "Will Not Disclose",
        "rebid_window_start": "2027-03-01",
        "rebid_window_end": "2029-06-30",
        "priority": "WATCH",
        "notes": "Requested debrief — use learnings for next round."
    },
    {
        "agency": "Illinois Secretary of State",
        "search_terms": ["illinois secretary of state", "IL SOS document management", "IL SOS CLM"],
        "state": "IL",
        "tcv": 120000,
        "reason": "Price: License",
        "competitor": "Global Solutions Group",
        "rebid_window_start": "2027-05-01",
        "rebid_window_end": "2029-08-31",
        "priority": "WATCH",
        "notes": "Lost to doc mgmt specialist at $1.08M/3yr. We were 4x on price."
    },

    # === TIER 4: DELAYED PROJECTS — mid-term reactivation ===
    {
        "agency": "Lower Colorado River Authority",
        "search_terms": ["lower colorado river authority", "LCRA CLM", "LCRA contract"],
        "state": "TX",
        "tcv": 210000,
        "reason": "No Decision / Project Delayed",
        "competitor": "N/A",
        "rebid_window_start": "2025-10-01",
        "rebid_window_end": "2026-12-31",
        "priority": "MEDIUM",
        "notes": "Stalled on integration concerns. Address integration story proactively."
    },
    {
        "agency": "County of Cobb",
        "search_terms": ["cobb county", "cobb county CLM", "cobb county contract"],
        "state": "GA",
        "tcv": 90900,
        "reason": "No Decision / Project Delayed",
        "competitor": "N/A",
        "rebid_window_start": "2025-09-01",
        "rebid_window_end": "2026-12-31",
        "priority": "MEDIUM",
        "notes": "CLM RFP anticipated separately from eProcurement (awarded to OpenGov)."
    },
    {
        "agency": "Connecticut DEEP",
        "search_terms": ["connecticut energy environmental", "CT DEEP CLM", "connecticut contract management"],
        "state": "CT",
        "tcv": 25000,
        "reason": "No Decision / Project Delayed",
        "competitor": "N/A",
        "rebid_window_start": "2025-10-01",
        "rebid_window_end": "2026-12-31",
        "priority": "LOW",
        "notes": "Project lead left public sector. Find new sponsor."
    },
    {
        "agency": "Hennepin County",
        "search_terms": ["hennepin county", "hennepin CLM", "hennepin contract management"],
        "state": "MN",
        "tcv": 59710,
        "reason": "No Decision / Project Delayed",
        "competitor": "N/A",
        "rebid_window_start": "2026-06-01",
        "rebid_window_end": "2027-06-30",
        "priority": "LOW",
        "notes": "No next steps currently. Nurture long-term."
    },
    {
        "agency": "Federal Aviation Administration",
        "search_terms": ["FAA contract management", "FAA CLM", "federal aviation administration esignature"],
        "state": "DC",
        "tcv": 198000,
        "reason": "Stale Oppty",
        "competitor": "Adobe",
        "rebid_window_start": "2026-01-01",
        "rebid_window_end": "2027-12-31",
        "priority": "MEDIUM",
        "notes": "Two prior touchpoints. Stale opp at $198K. Monitor SAM.gov closely."
    },
    {
        "agency": "US General Services Administration",
        "search_terms": ["GSA esignature", "GSA electronic signature", "GSA contract management"],
        "state": "DC",
        "tcv": 0,
        "reason": "No Decision / Project Delayed",
        "competitor": "N/A",
        "rebid_window_start": "2026-01-01",
        "rebid_window_end": "2027-12-31",
        "priority": "MEDIUM",
        "notes": "Two RFI touchpoints in Q4-2025 and Q2-2026. Active interest."
    },
]


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH, mode="a")
    ]
)
log = logging.getLogger("procurement_monitor")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Alert:
    timestamp: str
    source: str          # "SAM.gov", "State Portal", "Budget Signal"
    agency_match: str    # matched watchlist agency
    opportunity_title: str
    solicitation_number: str
    posted_date: str
    response_deadline: str
    url: str
    match_score: float
    watchlist_tcv: float
    watchlist_priority: str
    notes: str


# ---------------------------------------------------------------------------
# Config Management
# ---------------------------------------------------------------------------

def load_config():
    if not CONFIG_PATH.exists():
        log.info(f"No config found. Creating template at {CONFIG_PATH}")
        with open(CONFIG_PATH, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        log.info("Please edit config.json with your SAM.gov API key, then re-run.")
        sys.exit(0)

    with open(CONFIG_PATH) as f:
        cfg = json.load(f)

    if cfg.get("sam_api_key") == "YOUR_SAM_GOV_API_KEY_HERE":
        log.error("SAM.gov API key not configured. Edit config.json first.")
        log.error("Get a free key at: https://sam.gov → Profile → Account Details → Public API Key")
        sys.exit(1)

    return cfg


# ---------------------------------------------------------------------------
# Fuzzy Matching
# ---------------------------------------------------------------------------

def normalize(text):
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def keyword_match_score(text, search_terms):
    """
    Score how well `text` matches the given search terms.
    Returns a float 0.0 - 1.0.
    """
    text_normalized = normalize(text)
    if not text_normalized:
        return 0.0

    scores = []
    for term in search_terms:
        term_words = normalize(term).split()
        if not term_words:
            continue
        matches = sum(1 for w in term_words if w in text_normalized)
        scores.append(matches / len(term_words))

    return max(scores) if scores else 0.0


def check_keyword_matches(text, global_keywords):
    """Check if text contains any of the global eSign/CLM keywords."""
    text_lower = normalize(text)
    return any(normalize(kw) in text_lower for kw in global_keywords)


# ---------------------------------------------------------------------------
# SAM.gov API Module
# ---------------------------------------------------------------------------

SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search"


def search_sam_gov(api_key, posted_from, posted_to, keywords=None,
                   naics_codes=None, limit=100):
    """
    Search SAM.gov Opportunities API.

    Args:
        api_key: SAM.gov public API key
        posted_from: start date (MM/DD/YYYY)
        posted_to: end date (MM/DD/YYYY)
        keywords: list of keyword strings to search in title
        naics_codes: list of NAICS codes to filter
        limit: max results per request (max 1000)

    Returns:
        list of opportunity dicts
    """
    all_results = []

    # SAM.gov doesn't support keyword search in one call,
    # so we search by title for each keyword
    search_titles = keywords or ["electronic signature"]

    for title_kw in search_titles:
        offset = 0
        while True:
            params = {
                "api_key": api_key,
                "limit": min(limit, 1000),
                "offset": offset,
                "postedFrom": posted_from,
                "postedTo": posted_to,
                "title": title_kw,
            }

            # Add NAICS filter if provided
            if naics_codes:
                params["ncode"] = ",".join(naics_codes)

            try:
                log.info(f"SAM.gov query: title='{title_kw}' offset={offset}")
                resp = requests.get(SAM_API_BASE, params=params, timeout=30)

                if resp.status_code == 429:
                    log.warning("Rate limited by SAM.gov. Waiting 60s...")
                    time.sleep(60)
                    continue

                resp.raise_for_status()
                data = resp.json()

                opps = data.get("opportunitiesData", [])
                if not opps:
                    break

                all_results.extend(opps)
                log.info(f"  Found {len(opps)} opportunities")

                # Pagination
                total = data.get("totalRecords", 0)
                offset += len(opps)
                if offset >= total:
                    break

                time.sleep(1)  # be nice to the API

            except requests.exceptions.RequestException as e:
                log.error(f"SAM.gov API error: {e}")
                break

    # Deduplicate by noticeId
    seen_ids = set()
    unique = []
    for opp in all_results:
        nid = opp.get("noticeId", "")
        if nid not in seen_ids:
            seen_ids.add(nid)
            unique.append(opp)

    log.info(f"SAM.gov total unique opportunities: {len(unique)}")
    return unique


def search_sam_by_naics_only(api_key, posted_from, posted_to, naics_codes, limit=1000):
    """
    Broader SAM.gov search using only NAICS codes (no title filter).
    Catches opportunities that don't use obvious keywords in titles.
    """
    all_results = []
    offset = 0

    while True:
        params = {
            "api_key": api_key,
            "limit": min(limit, 1000),
            "offset": offset,
            "postedFrom": posted_from,
            "postedTo": posted_to,
            "ncode": ",".join(naics_codes),
        }

        try:
            log.info(f"SAM.gov NAICS-only query: offset={offset}")
            resp = requests.get(SAM_API_BASE, params=params, timeout=30)

            if resp.status_code == 429:
                log.warning("Rate limited. Waiting 60s...")
                time.sleep(60)
                continue

            resp.raise_for_status()
            data = resp.json()

            opps = data.get("opportunitiesData", [])
            if not opps:
                break

            all_results.extend(opps)
            total = data.get("totalRecords", 0)
            offset += len(opps)
            log.info(f"  NAICS batch: {len(opps)} / {total} total")

            if offset >= total or offset >= 5000:  # safety cap
                break

            time.sleep(1)

        except requests.exceptions.RequestException as e:
            log.error(f"SAM.gov NAICS search error: {e}")
            break

    return all_results


# ---------------------------------------------------------------------------
# State Procurement Portal Scrapers
# ---------------------------------------------------------------------------
# These are templates. State portals vary wildly in structure.
# Most require Selenium for JS-heavy sites. Below are the ones with
# simpler HTML that can be parsed with requests + BeautifulSoup.

def search_state_portal_generic(state, portal_url, search_terms):
    """
    Generic state portal search template.

    IMPORTANT: Most state portals require customization. This function
    demonstrates the pattern — you'll need to adapt selectors per state.

    Many state portals (CA CaleProcure, FL MyFloridaMarketplace, TX SmartBuy)
    are JavaScript-heavy and need Selenium. See the Selenium section below.
    """
    if BeautifulSoup is None:
        log.warning("beautifulsoup4 not installed. Skipping state portal scraping.")
        return []

    results = []
    for term in search_terms:
        try:
            # This is a template — the actual URL params differ per state
            search_url = f"{portal_url}?q={requests.utils.quote(term)}"
            resp = requests.get(search_url, timeout=15, headers={
                "User-Agent": "Mozilla/5.0 (procurement monitoring script)"
            })
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Generic pattern — look for table rows or list items with bid info
            # YOU MUST CUSTOMIZE THIS PER STATE PORTAL
            for row in soup.select("table tr, .bid-item, .search-result"):
                text = row.get_text(" ", strip=True)
                if any(normalize(kw) in normalize(text) for kw in search_terms):
                    results.append({
                        "title": text[:200],
                        "url": portal_url,
                        "state": state,
                        "source": f"State Portal ({state})"
                    })

        except Exception as e:
            log.debug(f"State portal {state} search error: {e}")

    return results


# ---------------------------------------------------------------------------
# For JavaScript-heavy state portals, use Selenium:
# ---------------------------------------------------------------------------
#
# from selenium import webdriver
# from selenium.webdriver.chrome.options import Options
# from selenium.webdriver.common.by import By
# from selenium.webdriver.support.ui import WebDriverWait
# from selenium.webdriver.support import expected_conditions as EC
#
# def search_state_selenium(state, portal_url, search_terms):
#     """Use headless Chrome for JS-heavy state procurement portals."""
#     opts = Options()
#     opts.add_argument("--headless")
#     opts.add_argument("--no-sandbox")
#     driver = webdriver.Chrome(options=opts)
#
#     results = []
#     try:
#         driver.get(portal_url)
#         # Wait for search box to load
#         search_box = WebDriverWait(driver, 10).until(
#             EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='text']"))
#         )
#         for term in search_terms:
#             search_box.clear()
#             search_box.send_keys(term)
#             search_box.submit()
#             time.sleep(3)  # wait for results
#
#             # Parse results — customize selectors per portal
#             rows = driver.find_elements(By.CSS_SELECTOR, ".result-row, table tbody tr")
#             for row in rows:
#                 results.append({
#                     "title": row.text[:200],
#                     "url": driver.current_url,
#                     "state": state,
#                     "source": f"State Portal ({state})"
#                 })
#     finally:
#         driver.quit()
#     return results


# ---------------------------------------------------------------------------
# Matching Engine
# ---------------------------------------------------------------------------

def match_opportunities_to_watchlist(opportunities, watchlist, config):
    """
    Match SAM.gov opportunities against the watchlist.
    Returns list of Alert objects.
    """
    alerts = []
    threshold = config.get("match_threshold", 0.4)
    global_keywords = config.get("search_keywords", [])

    for opp in opportunities:
        title = opp.get("title", "")
        description = opp.get("description", "")
        dept = opp.get("department", "") or opp.get("fullParentPathName", "")
        combined_text = f"{title} {description} {dept}"

        for entry in watchlist:
            # Score against agency-specific search terms
            score = keyword_match_score(combined_text, entry["search_terms"])

            # Bonus if it also matches global eSign/CLM keywords
            if check_keyword_matches(combined_text, global_keywords):
                score = min(score + 0.2, 1.0)

            if score >= threshold:
                # Build the SAM.gov URL for this opportunity
                notice_id = opp.get("noticeId", "")
                opp_url = f"https://sam.gov/opp/{notice_id}/view" if notice_id else ""

                alert = Alert(
                    timestamp=datetime.now().isoformat(),
                    source="SAM.gov",
                    agency_match=entry["agency"],
                    opportunity_title=title,
                    solicitation_number=opp.get("solicitationNumber", ""),
                    posted_date=opp.get("postedDate", ""),
                    response_deadline=opp.get("responseDeadLine", ""),
                    url=opp_url,
                    match_score=round(score, 2),
                    watchlist_tcv=entry["tcv"],
                    watchlist_priority=entry["priority"],
                    notes=entry.get("notes", "")
                )
                alerts.append(alert)
                log.info(
                    f"  MATCH ({score:.0%}): '{title}' → {entry['agency']} "
                    f"[{entry['priority']}]"
                )

    return alerts


# ---------------------------------------------------------------------------
# Output: CSV + HTML
# ---------------------------------------------------------------------------

def save_alerts_csv(alerts):
    """Append alerts to CSV file."""
    file_exists = ALERTS_CSV.exists()
    with open(ALERTS_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "timestamp", "source", "agency_match", "opportunity_title",
            "solicitation_number", "posted_date", "response_deadline",
            "url", "match_score", "watchlist_tcv", "watchlist_priority", "notes"
        ])
        if not file_exists:
            writer.writeheader()
        for alert in alerts:
            writer.writerow(asdict(alert))
    log.info(f"Saved {len(alerts)} alerts to {ALERTS_CSV}")


def generate_html_dashboard(alerts):
    """Generate a visual HTML dashboard of all alerts."""
    # Read existing alerts from CSV if it exists
    all_alerts = []
    if ALERTS_CSV.exists():
        with open(ALERTS_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            all_alerts = list(reader)

    # Sort by timestamp descending
    all_alerts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    rows_html = ""
    for a in all_alerts[:200]:  # cap at 200 rows
        priority = a.get("watchlist_priority", "")
        pclass = {"HIGH": "tag-red", "MEDIUM": "tag-yellow", "WATCH": "tag-blue", "LOW": "tag-gray"}.get(priority, "tag-gray")
        score_pct = float(a.get("match_score", 0)) * 100
        tcv = float(a.get("watchlist_tcv", 0))
        url = a.get("url", "#")
        rows_html += f"""<tr>
<td>{a.get('timestamp','')[:10]}</td>
<td><span class="tag {pclass}">{priority}</span></td>
<td>{a.get('agency_match','')}</td>
<td><a href="{url}" target="_blank">{a.get('opportunity_title','')[:80]}</a></td>
<td>{a.get('solicitation_number','')}</td>
<td>{a.get('response_deadline','')[:10]}</td>
<td>{score_pct:.0f}%</td>
<td>${tcv:,.0f}</td>
<td>{a.get('source','')}</td>
</tr>"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Procurement Monitor Alerts</title>
<style>
body {{ font-family: system-ui, sans-serif; margin: 20px; background: #f5f5f5; }}
h1 {{ color: #1a1a2e; }} table {{ width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
th {{ background: #1a1a2e; color: white; padding: 10px; text-align: left; font-size: 13px; }}
td {{ padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }}
tr:hover td {{ background: #f0f7ff; }}
a {{ color: #2980b9; }}
.tag {{ display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }}
.tag-red {{ background: #ffe0e6; color: #c0392b; }}
.tag-yellow {{ background: #fef9e7; color: #f39c12; }}
.tag-blue {{ background: #d6eaf8; color: #2980b9; }}
.tag-gray {{ background: #eee; color: #666; }}
.stats {{ display: flex; gap: 20px; margin: 20px 0; }}
.stat {{ background: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }}
.stat .num {{ font-size: 28px; font-weight: 800; color: #e94560; }}
.stat .lbl {{ font-size: 12px; color: #666; }}
</style></head><body>
<h1>Procurement Monitor — Alert Dashboard</h1>
<p>Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Monitoring {len(WATCHLIST)} watchlist agencies</p>
<div class="stats">
<div class="stat"><div class="num">{len(all_alerts)}</div><div class="lbl">Total Alerts</div></div>
<div class="stat"><div class="num">{sum(1 for a in all_alerts if a.get('watchlist_priority')=='HIGH')}</div><div class="lbl">High Priority</div></div>
<div class="stat"><div class="num">{len(set(a.get('agency_match','') for a in all_alerts))}</div><div class="lbl">Agencies Matched</div></div>
</div>
<table>
<tr><th>Date</th><th>Priority</th><th>Watchlist Agency</th><th>Opportunity</th><th>Solicitation #</th><th>Deadline</th><th>Match</th><th>Prior TCV</th><th>Source</th></tr>
{rows_html}
</table>
</body></html>"""

    with open(ALERTS_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    log.info(f"Dashboard generated: {ALERTS_HTML}")


# ---------------------------------------------------------------------------
# Main Orchestrator
# ---------------------------------------------------------------------------

def run_scan(config, days_back=None):
    """Run a full scan across all sources."""
    scan_days = days_back or config.get("scan_window_days", 30)
    to_date = datetime.now()
    from_date = to_date - timedelta(days=scan_days)

    posted_from = from_date.strftime("%m/%d/%Y")
    posted_to = to_date.strftime("%m/%d/%Y")

    log.info("=" * 60)
    log.info(f"PROCUREMENT MONITOR SCAN: {posted_from} → {posted_to}")
    log.info(f"Watchlist: {len(WATCHLIST)} agencies")
    log.info("=" * 60)

    all_alerts = []

    # --- 1. SAM.gov: Keyword-based search ---
    log.info("\n--- SAM.gov Keyword Search ---")
    sam_results = search_sam_gov(
        api_key=config["sam_api_key"],
        posted_from=posted_from,
        posted_to=posted_to,
        keywords=config.get("search_keywords", []),
        naics_codes=None,  # don't double-filter with keywords
        limit=100
    )

    # --- 2. SAM.gov: NAICS-based broader search ---
    log.info("\n--- SAM.gov NAICS Broad Search ---")
    naics_results = search_sam_by_naics_only(
        api_key=config["sam_api_key"],
        posted_from=posted_from,
        posted_to=posted_to,
        naics_codes=config.get("naics_codes", ["541512"]),
        limit=1000
    )

    # Combine and deduplicate
    seen_ids = {o.get("noticeId") for o in sam_results}
    for o in naics_results:
        if o.get("noticeId") not in seen_ids:
            sam_results.append(o)
            seen_ids.add(o.get("noticeId"))

    log.info(f"\nTotal SAM.gov opportunities to match: {len(sam_results)}")

    # --- 3. Match against watchlist ---
    sam_alerts = match_opportunities_to_watchlist(sam_results, WATCHLIST, config)
    all_alerts.extend(sam_alerts)

    # --- 4. State portal searches (optional) ---
    state_portals = config.get("state_portals", {})
    if state_portals and BeautifulSoup:
        log.info("\n--- State Portal Searches ---")
        for entry in WATCHLIST:
            state = entry.get("state", "")
            if state in state_portals:
                portal_url = state_portals[state]
                results = search_state_portal_generic(
                    state, portal_url, entry["search_terms"]
                )
                for r in results:
                    alert = Alert(
                        timestamp=datetime.now().isoformat(),
                        source=r["source"],
                        agency_match=entry["agency"],
                        opportunity_title=r["title"],
                        solicitation_number="",
                        posted_date="",
                        response_deadline="",
                        url=r["url"],
                        match_score=0.5,
                        watchlist_tcv=entry["tcv"],
                        watchlist_priority=entry["priority"],
                        notes=entry.get("notes", "")
                    )
                    all_alerts.append(alert)

    # --- 5. Output ---
    if all_alerts:
        save_alerts_csv(all_alerts)
        generate_html_dashboard(all_alerts)
        log.info(f"\n{'='*60}")
        log.info(f"SCAN COMPLETE: {len(all_alerts)} new alerts found!")
        log.info(f"Dashboard: {ALERTS_HTML}")
        log.info(f"CSV: {ALERTS_CSV}")
        log.info(f"{'='*60}")
    else:
        generate_html_dashboard([])  # refresh dashboard anyway
        log.info(f"\nScan complete. No new matches found.")

    return all_alerts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Monitor public procurement portals for rebid opportunities"
    )
    parser.add_argument(
        "--schedule", action="store_true",
        help="Run on a daily schedule (7am)"
    )
    parser.add_argument(
        "--backfill", type=int, default=None,
        help="Number of days to look back (overrides config)"
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Test mode: validate config and watchlist without calling APIs"
    )
    args = parser.parse_args()

    config = load_config()

    if args.test:
        log.info("TEST MODE — validating configuration")
        log.info(f"  API Key: {'Configured' if config['sam_api_key'] != 'YOUR_SAM_GOV_API_KEY_HERE' else 'MISSING'}")
        log.info(f"  Watchlist entries: {len(WATCHLIST)}")
        log.info(f"  Search keywords: {len(config.get('search_keywords', []))}")
        log.info(f"  NAICS codes: {config.get('naics_codes', [])}")
        log.info(f"  State portals: {len(config.get('state_portals', {}))}")
        high = sum(1 for w in WATCHLIST if w["priority"] == "HIGH")
        med = sum(1 for w in WATCHLIST if w["priority"] == "MEDIUM")
        watch = sum(1 for w in WATCHLIST if w["priority"] == "WATCH")
        log.info(f"  Priority breakdown: {high} HIGH, {med} MEDIUM, {watch} WATCH")
        total_tcv = sum(w["tcv"] for w in WATCHLIST)
        log.info(f"  Total watchlist TCV: ${total_tcv:,.0f}")
        log.info("Configuration is valid. Remove --test to run a live scan.")
        return

    if args.schedule:
        try:
            import schedule as sched_lib
        except ImportError:
            sys.exit("Install 'schedule' library: pip install schedule")

        log.info("Scheduling daily scan at 07:00...")
        sched_lib.every().day.at("07:00").do(run_scan, config, args.backfill)
        # Also run immediately on start
        run_scan(config, args.backfill)
        while True:
            sched_lib.run_pending()
            time.sleep(60)
    else:
        run_scan(config, args.backfill)


if __name__ == "__main__":
    main()
