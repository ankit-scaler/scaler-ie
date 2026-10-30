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


# Gemini sometimes files a plainly technical question under "Behavioral"
# (reported by the LST team: SQL and DSA questions showing up when learners
# filter for behavioural prep). These two patterns decide when such an answer
# deserves a second look. TECH_SIGNALS are strong signs the question asks for
# technical knowledge or work; BEHAVIOURAL_SIGNALS mark questions that really
# are behavioural even if a technical word appears ("tell me about a project
# where you used React"). Tested on the CO Dashboard's rule-labelled copy of
# the same workbook: 3 of 979 behavioural questions (0.3%) trip the check,
# and 64% of technical ones do — and a trip only means a second look, not a
# forced change.
TECH_SIGNALS = re.compile(r"""(?ix)
    \b(write|code|implement|build|create)\s+(a|an|the)?\s*(function|program|method|query|sql|class|script|api|endpoint|component|algorithm|code)\b
  | \b(sql|query|queries|join|joins|index(es|ing)?|normali[sz]ation|database|schema|nosql|mongodb|postgres|mysql|redis)\b
  | \b(array|arrays|string|strings|linked\s*list|binary\s*tree|tree|graph|heap|stack|queue|hash\s*map|hashmap|dictionary|recursion|dynamic\s*programming|dp|sorting|binary\s*search|two\s*pointers?|sliding\s*window|leetcode)\b
  | \b(time|space)\s+complexity\b | \bbig[\s-]?o\b
  | \bdesign\s+(a|an|the)\s+\w*\s*(system|service|api|database|schema|url\s*shortener|cache|rate\s*limiter|parking|class|lld|hld)\b | \bsystem\s+design\b | \blow[\s-]level\s+design\b
  | \b(oops?|polymorphism|inheritance|encapsulation|abstraction|interface|multithreading|thread|threads|concurrency|deadlock|garbage\s*collection|jvm|closure|closures|promise|promises|async|await|event\s*loop|hoisting|virtual\s*dom|react|hooks?|useeffect|usestate|redux|node\.?js|express|spring|java|python|javascript|typescript|c\+\+|golang|docker|kubernetes|k8s|terraform|ci\s*/\s*cd|jenkins|aws|ec2|s3|lambda|linux|bash|git|http|rest|graphql|tcp|dns|load\s*balanc\w*|microservices?|kafka|pandas|numpy|regression|classification|overfitting|gradient|neural|transformer|llm|rag|embedding|machine\s*learning|deep\s*learning|statistics|probability|p-?value|hypothesis)\b
  | \b(output\s+of|difference\s+between|what\s+is\s+the\s+use\s+of|how\s+does\s+\w+(\s+\w+)?\s+work)\b
""")
BEHAVIOURAL_SIGNALS = re.compile(r"""(?ix)
    \b(tell\s+(me|us)\s+about\s+(a\s+time|yourself|a\s+situation|your)|describe\s+a\s+(time|situation)|a\s+time\s+when|why\s+(do\s+you\s+want|should\s+we|this\s+company|are\s+you\s+leaving|did\s+you\s+leave)|strengths?|weakness(es)?|conflict|disagree|your\s+manager|team\s*mate|teammate|stakeholder|deadline|failure|failed|mistake|challenge\s+you\s+faced|proud\s+of|where\s+do\s+you\s+see\s+yourself|(expected|current)\s+(ctc|salary|package)|salary\s+expectations?|notice\s+period|relocat\w*|introduce\s+yourself|walk\s+(me|us)\s+through\s+your\s+(resume|cv|background|project)|tell\s+(me|us)\s+about\s+(a|your)\s+(recent\s+)?projects?)\b
""")


def looks_technical(question: str) -> bool:
    q = question or ""
    return bool(TECH_SIGNALS.search(q)) and not BEHAVIOURAL_SIGNALS.search(q)


def is_behavioral_topic(topic: Optional[str]) -> bool:
    # Matched loosely so a rename in Admin ("Behavioural", "Behavioral / HR")
    # doesn't silently switch the check off.
    return bool(topic) and topic.strip().lower().startswith("behavio")


# Appended to the prompt for the second look: "Behavioral" stays allowed, so
# a question that really is behavioural keeps its topic.
RECHECK_NOTE = (
    "\n\nNote: a first pass labelled this question Behavioral, but it contains "
    "technical terms. Choose Behavioral ONLY if the question is about the "
    "candidate's own experiences, attitudes, motivation or soft skills. If it "
    "asks for technical knowledge, code, a query, a design or an explanation "
    "of how something works, choose the matching technical topic instead."
)


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

    def build_user_prompt(self, question: str, raw_topic: Optional[str], recheck: bool = False) -> str:
        hint = f'\nSheet\'s raw "Related Topic" value (weak hint only, often wrong): {raw_topic}' if raw_topic else ""
        # Folded into the single user turn (no separate system_instruction
        # param) so the exact same "contents" shape works for both a direct
        # generate_content call and an inline batch request.
        return f"{self.system_prompt}\n\n---\n\nQuestion: {question}{hint}{RECHECK_NOTE if recheck else ''}"

    def _parse_topic(self, text: Optional[str]) -> str:
        if not text:
            return "Uncategorized"
        try:
            topic = json.loads(text)
        except Exception:
            return "Uncategorized"
        return topic if topic in self.topics else "Uncategorized"

    def _ask(self, client, prompt: str) -> str:
        from google.genai import types
        resp = client.models.generate_content(
            model=CLASSIFY_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=self.enum,
            ),
        )
        return self._parse_topic(resp.text)

    def recheck_behavioral(self, client, question: str, raw_topic: Optional[str]) -> str:
        """The second look for a question labelled Behavioral that reads as
        technical (see looks_technical). Gemini may still answer Behavioral."""
        return self._ask(client, self.build_user_prompt(question, raw_topic, recheck=True))

    def classify_one(self, client, question: str, raw_topic: Optional[str]) -> str:
        """Direct (non-batch) classification of a single question — used by
        the nightly sync, where only a handful of new rows need classifying,
        and by backfill_topics.py. A "Behavioral" answer on a question that
        reads as technical gets one second look before it's accepted."""
        topic = self._ask(client, self.build_user_prompt(question, raw_topic))
        if is_behavioral_topic(topic) and looks_technical(question):
            topic = self.recheck_behavioral(client, question, raw_topic)
        return topic

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
