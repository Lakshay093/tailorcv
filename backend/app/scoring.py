import re

from app.schemas import JobAnalysis, KeywordAnalysis, KeywordScore


def contains_term(text: str, term: str) -> bool:
    # Unicode-aware boundaries preserve C++, C#, .NET, and short terms like R.
    pattern = r"(?<!\w)" + r"\s+".join(re.escape(part) for part in term.strip().split()) + r"(?!\w)"
    return bool(re.search(pattern, text, flags=re.IGNORECASE))


def score(text: str, keywords: list[str]) -> KeywordScore:
    matched = [term for term in keywords if contains_term(text, term)]
    missing = [term for term in keywords if term not in matched]
    return KeywordScore(score=round(100 * len(matched) / len(keywords)) if keywords else 0, matched=matched, missing=missing)


def compare(original: str, tailored: str, job: JobAnalysis) -> KeywordAnalysis:
    keywords = list(dict.fromkeys(req.keyword for req in job.requirements))
    return KeywordAnalysis(original=score(original, keywords), tailored=score(tailored, keywords), method="Heuristic keyword estimate: case-insensitive whole-term matches / distinct JD terms × 100. Same terms and equal weights for both versions. Not an ATS score.")
