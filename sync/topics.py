"""
Canonical topic taxonomy for AI topic classification (see sync_sheet.py and
backfill_topics.py), using Google's Gemini API (the `google-genai` package).
Kept deliberately high-level and small — a handful of CS-fundamentals
buckets plus the actual tech stacks that show up across interview
questions — rather than granular subtopics, so "Binary Tree", "Binary
Trees", and "Binary Search Tree (BST)" all collapse into one "Trees &
Graphs" bucket instead of staying three near-duplicate filter options.

The taxonomy itself lives in the `canonical_topics` table, not this file —
an admin adds/renames/deletes topics from Admin's topic manager (see
app/api/admin/topics), and both the nightly classifier here and the website
read that table live. fetch_canonical_topics() below is the read path; if
the table is ever empty or unreachable, it falls back to _FALLBACK_TOPICS
(a snapshot of the taxonomy as of this writing) rather than classifying
against zero topics.

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

_FALLBACK_TOPICS = [
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
    "HTML & CSS",
    "React",
    "Node.js & Backend (MERN)",
    "Python",
    "Java & Spring",
    "Machine Learning, AI & Data Science",
    "DevOps & Cloud",
    "Testing & QA",
    "Security",
    "Excel",
    "CRM",
    # Non-technical
    "Behavioral",
    "Case Study & Product Thinking",
    "Aptitude & Guesstimates",
    # Fallback — never force a bad match into one of the buckets above.
    "Uncategorized",
]


def fetch_canonical_topics(supa) -> list[str]:
    """Live topic list from the canonical_topics table. Falls back to
    _FALLBACK_TOPICS if the table is empty or the query fails, so a classify
    run never ends up with zero valid topics to choose from."""
    try:
        res = supa.table("canonical_topics").select("name").order("id").execute()
        names = [r["name"] for r in (res.data or []) if r.get("name")]
    except Exception:
        names = []
    return names or list(_FALLBACK_TOPICS)


def _enum_key(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper() or "TOPIC"


CLASSIFY_MODEL = "gemini-3.5-flash-lite"


class Classifier:
    """Bundles one snapshot of the canonical topic list with the Gemini
    structured-output Enum and system prompt built from it. Built once per
    script run (via load_classifier) and reused across every row that run
    classifies — rebuilding the Enum per-row would be wasted work in the
    concurrent loops both sync_sheet.py and backfill_topics.py run."""

    def __init__(self, topics: list[str]):
        self.topics = topics
        # A bare Enum (not a wrapping {"topic": ...} object) — Gemini's
        # structured output then returns just the chosen value as a JSON
        # string (e.g. "Arrays & Strings"), which keeps both the schema and
        # the parsing below trivial. Member names are sanitized (spaces/&/
        # parens aren't valid Python identifiers); the enum *values* are the
        # real canonical strings.
        self.enum = Enum("CanonicalTopic", {_enum_key(t): t for t in topics})
        self.system_prompt = (
            "You classify a technical interview question into exactly one topic from "
            "a fixed list. Base your answer on what the QUESTION TEXT actually asks, "
            "not on the sheet's raw topic tag — that tag is frequently wrong or just "
            "the name of the course module the question was pulled from (e.g. a "
            "JavaScript event-loop question tagged \"Java\"), so treat it only as a "
            "weak hint, never as the answer. Pick the single closest match. If the "
            "question spans several topics, pick the most central one. Only use "
            "\"Uncategorized\" if truly nothing on the list fits — do not invent a "
            "new topic name.\n\n"
            "Topics:\n" + "\n".join(f"- {t}" for t in topics)
        )

    def build_user_prompt(self, question: str, raw_topic: Optional[str]) -> str:
        hint = f'\nSheet\'s raw "Related Topic" value (weak hint only, often wrong): {raw_topic}' if raw_topic else ""
        # Folded into the single user turn (no separate system_instruction
        # param) so the exact same "contents" shape works for both a direct
        # generate_content call and an inline batch request.
        return f"{self.system_prompt}\n\n---\n\nQuestion: {question}{hint}"

    def _parse_topic(self, text: Optional[str]) -> str:
        if not text:
            return "Uncategorized"
        try:
            topic = json.loads(text)
        except Exception:
            return "Uncategorized"
        return topic if topic in self.topics else "Uncategorized"

    def classify_one(self, client, question: str, raw_topic: Optional[str]) -> str:
        """Direct (non-batch) classification of a single question — used by
        the nightly sync, where only a handful of new rows need classifying."""
        from google.genai import types

        resp = client.models.generate_content(
            model=CLASSIFY_MODEL,
            contents=self.build_user_prompt(question, raw_topic),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=self.enum,
            ),
        )
        return self._parse_topic(resp.text)

    def build_batch_request(self, question: str, raw_topic: Optional[str]) -> dict:
        """One inline Batch API request for a question — used by
        backfill_topics.py. Gemini's inline batch mode has no per-request key
        (unlike the file/JSONL mode), so results come back positionally; the
        caller must keep its own parallel list of question ids in the same
        order it builds requests, matched back up by index."""
        return {
            "contents": self.build_user_prompt(question, raw_topic),
            "config": {
                "response_mime_type": "application/json",
                "response_schema": self.enum,
            },
        }


def load_classifier(supa) -> Classifier:
    """The one entry point callers should use — fetches the live taxonomy
    and returns a ready-to-use Classifier."""
    return Classifier(fetch_canonical_topics(supa))
