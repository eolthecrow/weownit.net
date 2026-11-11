#!/usr/bin/env python3
"""Pure, fail-closed per-story eligibility for owner-approved Security Briefings.

No network access, approvals, publication, GitHub writes, or status synchronization.
Source evidence MUST come from independent primary-source review; this function
does not perform or assert fact checking.
"""
from urllib.parse import urlsplit


def _https(url):
    if not isinstance(url, str):
        return None
    try:
        value = urlsplit(url)
    except ValueError:
        return None
    if value.scheme != "https" or not value.hostname or value.username or value.password:
        return None
    return value.hostname.lower(), value.path.rstrip("/"), value.query


def _guidance_present(story):
    if any(not isinstance(story.get(lang), list) or len(story[lang]) != 5
           or any(not isinstance(v, str) or not v.strip() for v in story[lang])
           for lang in ("en", "ro")):
        return False
    guidance = story.get("guidance")
    if not isinstance(guidance, dict):
        return False
    for lang in ("en", "ro"):
        value = guidance.get(lang)
        if not isinstance(value, dict):
            return False
        if any(not isinstance(value.get(k), str) or not value[k].strip()
               for k in ("official", "weownit")):
            return False
    return True


def plan_publication(candidates, approved_ids, published_articles, source_evidence):
    """Return statuses and ready IDs; no mutation of inputs.

    approved_ids must be taken ONLY from the authenticated editorial_approved
    response. source_evidence[id] must have verified=True, date_verified=True,
    claims_verified=True and verified_url=<the independently confirmed source>.
    Different source hostnames fail closed, requiring separate manual review.
    Existing source overlap fails closed as DUPLICATE_COVERED; the editor can
    decide whether a genuinely different angle merits a new approved article.
    """
    if not isinstance(approved_ids, (set, list, tuple)):
        raise ValueError("Explicit approved IDs are required")
    allowed = set(approved_ids)
    if len(allowed) != len(approved_ids):
        raise ValueError("Duplicate owner approvals")
    if not isinstance(source_evidence, dict):
        raise ValueError("Source evidence mapping required")

    main_ids = {str(x.get("id")) for x in published_articles}
    main_urls = set()
    main_slugs = {x.get("slug") for x in published_articles if x.get("slug")}
    for row in published_articles:
        for entry in row.get("sources", []):
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                normalized = _https(entry[1])
                if normalized:
                    main_urls.add(normalized)

    seen, results = set(), []
    for story in candidates:
        story_id = story.get("id")
        if not isinstance(story_id, str) or not story_id:
            raise ValueError("Stable story ID required")
        if story_id in seen:
            raise ValueError("Duplicate candidate story ID: " + story_id)
        seen.add(story_id)
        row = {"id": story_id, "state": None, "reason": None}
        original = _https(story.get("url"))
        evidence = source_evidence.get(story_id, {})
        verified = _https(evidence.get("verified_url")) if isinstance(evidence, dict) else None

        if story_id not in allowed:
            row.update(state="NOT_APPROVED", reason="No explicit owner approval")
        elif story_id in main_ids:
            row.update(state="ALREADY_PUBLISHED", reason="Stable ID already in main")
        elif original in main_urls or (story.get("slug") and story["slug"] in main_slugs):
            row.update(state="DUPLICATE_COVERED", reason="Source or slug already published; editorial review required")
        elif not _guidance_present(story):
            row.update(state="SOURCE_BLOCKED", reason="Incomplete EN/RO guidance or story data")
        elif original is None or verified is None:
            row.update(state="SOURCE_BLOCKED", reason="Invalid or unverified HTTPS source")
        elif verified[0] != original[0]:
            row.update(state="SOURCE_BLOCKED", reason="Canonical source changed host; manual confirmation required")
        elif not all(evidence.get(k) is True for k in ("verified", "date_verified", "claims_verified")):
            row.update(state="SOURCE_BLOCKED", reason="Primary source, date or claims not independently verified")
        else:
            row.update(state="SOURCE_VERIFIED", reason="Eligible for generated PR; not yet published")
        results.append(row)

    extra_approvals = allowed - seen
    if extra_approvals:
        raise ValueError("Approved IDs missing from candidate input: " + ", ".join(sorted(extra_approvals)))
    return {"stories": results,
            "ready_ids": [x["id"] for x in results if x["state"] == "SOURCE_VERIFIED"],
            "blocked_ids": [x["id"] for x in results if x["state"] == "SOURCE_BLOCKED"]}


if __name__ == "__main__":
    raise SystemExit("Import plan_publication from a reviewed tool/test; do not auto-publish.")
