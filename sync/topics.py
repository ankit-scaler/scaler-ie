"""
Canonical topic taxonomy for AI topic classification (see sync_sheet.py and
backfill_topics.py), using Google's Gemini API (the `google-genai` package).
Kept deliberately high-level and small — a handful of CS-fundamentals
buckets plus the actual tech stacks that show up across interview
questions — rather than granular subtopics, so "Binary Tree", "Binary
Trees", and "Binary Search Tree (BST)" all collapse into one "Trees &
Graphs" bucket instead of staying three near-duplicate filter options.

This list is meant to be edited by hand as real data comes in — after the
first backfill, check the "Uncategorized" bucket in Admin's Topic breakdown
(or the tracking sheet) for recurring themes that deserve their own entry.

Uses generate_content (not the newer Interactions API) on purpose: as of
this writing the Batch API's structured-output support is only confirmed
against generate_content's request/config shape, and using the same call
shape for both the nightly direct-call path and the batch backfill path
keeps the two from silently drifting apart.
"""
import json
import re
from enum import Enum
from typing import Optional

CANONICAL_TOPICS = [
    # CS fundamentals / DSA
    "Arrays & Strings",
    "Linked Lists",
    "Trees & Graphs",
    "Dynamic Programming",
    "Recursion & Backtracking",
    "Sorting & Searching",
    "Hashing",
    "Stacks & Queues",
    "Greedy Algorithms",
    "Bit Manipulation",
    "Math & Number Theory",
    # Architecture / systems
    "System Design",
    "Object-Oriented Design",
    "Databases & SQL",
    "Operating Systems",
    "Networking",
    "Distributed Systems",
    # Stack / technology specific
    "JavaScript & TypeScript",
    "React",
    "Node.js & Backend (MERN)",
    "Python",
    "Java & Spring",
    "Machine Learning, AI & Data Science",
    "DevOps & Cloud",
    "Testing & QA",
    "Security",
    # Non-technical
    "Behavioral",
    "Case Study & Product Thinking",
    # Fallback — never force a bad match into one of the buckets above.
    "Uncategorized",
]


def _enum_key(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper() or "TOPIC"


# A bare Enum (not a wrapping {"topic": ...} object) — Gemini's structured
# output then returns just the chosen value as a JSON string (e.g.
# "Arrays & Strings"), which keeps both the schema and the parsing below
# trivial. Member names are sanitized (spaces/&/parens aren't valid Python
# identifiers); the enum *values* are the real canonical strings.
CanonicalTopic = Enum("CanonicalTopic", {_enum_key(t): t for t in CANONICAL_TOPICS})

CLASSIFY_MODEL = "gemini-3.5-flash-lite"

CLASSIFY_SYSTEM_PROMPT = (
    "You classify a technical interview question into exactly one topic from "
    "a fixed list. Base your answer on what the QUESTION TEXT actually asks, "
    "not on the sheet's raw topic tag — that tag is frequently wrong or just "
    "the name of the course module the question was pulled from (e.g. a "
    "JavaScript event-loop question tagged \"Java\"), so treat it only as a "
    "weak hint, never as the answer. Pick the single closest match. If the "
    "question spans several topics, pick the most central one. Only use "
    "\"Uncategorized\" if truly nothing on the list fits — do not invent a "
    "new topic name.\n\n"
    "Topics:\n" + "\n".join(f"- {t}" for t in CANONICAL_TOPICS)
)


def build_user_prompt(question: str, raw_topic: Optional[str]) -> str:
    hint = f'\nSheet\'s raw "Related Topic" value (weak hint only, often wrong): {raw_topic}' if raw_topic else ""
    # Folded into the single user turn (no separate system_instruction
    # param) so the exact same "contents" shape works for both a direct
    # generate_content call and an inline batch request.
    return f"{CLASSIFY_SYSTEM_PROMPT}\n\n---\n\nQuestion: {question}{hint}"


def _parse_topic(text: Optional[str]) -> str:
    if not text:
        return "Uncategorized"
    try:
        topic = json.loads(text)
    except Exception:
        return "Uncategorized"
    return topic if topic in CANONICAL_TOPICS else "Uncategorized"


def classify_one(client, question: str, raw_topic: Optional[str]) -> str:
    """Direct (non-batch) classification of a single question — used by the
    nightly sync, where only a handful of new rows need classifying."""
    from google.genai import types

    resp = client.models.generate_content(
        model=CLASSIFY_MODEL,
        contents=build_user_prompt(question, raw_topic),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CanonicalTopic,
        ),
    )
    return _parse_topic(resp.text)


def build_batch_request(question: str, raw_topic: Optional[str]) -> dict:
    """One inline Batch API request for a question — used by
    backfill_topics.py. Gemini's inline batch mode has no per-request key
    (unlike the file/JSONL mode), so results come back positionally; the
    caller must keep its own parallel list of question ids in the same
    order it builds requests, matched back up by index."""
    return {
        "contents": build_user_prompt(question, raw_topic),
        "config": {
            "response_mime_type": "application/json",
            "response_schema": CanonicalTopic,
        },
    }
