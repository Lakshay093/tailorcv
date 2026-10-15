import hashlib
import hmac
import json
import re
from collections import Counter

from app.errors import AppError
from app.schemas import Change, Resume, Warning


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def numbers(text: str) -> Counter:
    return Counter(re.findall(r"\d+(?:[.,]\d+)*%?", text))


def source_token(text: str, resume: Resume, key: str) -> str:
    payload = json.dumps({"text": text, "resume": resume.model_dump()}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def verify_source(text: str, resume: Resume, token: str, key: str):
    if not hmac.compare_digest(source_token(text, resume, key), token):
        raise AppError("SOURCE_CHANGED", "The original resume could not be verified. Upload it again before customizing.", 422)


def canonicalize(resume: Resume) -> Resume:
    resume = resume.model_copy(deep=True)
    for section in ("experience", "education", "projects", "additional_sections"):
        for index, entry in enumerate(getattr(resume, section)):
            entry.id = f"{section}-{index + 1}"
            for bi, bullet in enumerate(getattr(entry, "bullets", [])):
                bullet.id = f"{entry.id}-bullet-{bi + 1}"
    return resume


def validate_structure(resume: Resume, text: str) -> list[Warning]:
    source = normalized(text)
    protected = list(resume.contact.model_dump(exclude={"links"}).values()) + resume.contact.links + resume.skills + resume.certifications
    for exp in resume.experience:
        protected.extend([exp.employer, exp.title, exp.location, exp.start_date, exp.end_date])
    for edu in resume.education:
        protected.extend([edu.institution, edu.qualification, edu.dates, *edu.details])
    for project in resume.projects:
        protected.extend([project.name, project.description])
    for extra in resume.additional_sections:
        protected.extend(extra.items)
    protected.append(resume.summary)
    for value in protected:
        if value and normalized(value) not in source:
            raise AppError("UNSUPPORTED_EXTRACTION", "AI structuring changed source wording or added a fact. Review the extraction and upload again.", 422)
    for entry in [*resume.experience, *resume.projects]:
        for bullet in entry.bullets:
            if not bullet.source_excerpt.strip() or normalized(bullet.source_excerpt) not in source or normalized(bullet.text) != normalized(bullet.source_excerpt):
                raise AppError("UNSUPPORTED_EXTRACTION", "A structured bullet could not be traced exactly to the extracted resume. Please try parsing again.", 422)
    # Flag source lines that may have been dropped; the raw preview always remains available.
    structured = normalized(json.dumps(resume.model_dump(), ensure_ascii=False))
    uncovered = []
    for line in text.splitlines():
        words = re.findall(r"\b[\w@.+-]+\b", line.casefold())
        if len(words) >= 5 and sum(word in structured for word in words) / len(words) < 0.8:
            uncovered.append(line)
    if uncovered:
        return [Warning(code="EXTRACTION_REVIEW", message=f"{len(uncovered)} source line(s) may not be fully represented in the structured resume. Compare the original text before proceeding.")]
    return []


def validate_tailoring(original: Resume, tailored: Resume, sections: list[str], original_text: str, keywords: list[str]) -> list[Warning]:
    def reject(message: str):
        raise AppError("FACTUAL_VALIDATION_FAILED", f"AI output rejected: {message} Your original resume is preserved.", 422)

    warnings = []
    for field in ("contact", "education", "certifications", "additional_sections"):
        if getattr(original, field) != getattr(tailored, field):
            reject(f"protected {field.replace('_', ' ')} changed.")
    for section in ("summary", "skills", "experience", "projects"):
        if section not in sections and getattr(tailored, section) != getattr(original, section):
            setattr(tailored, section, getattr(original.model_copy(deep=True), section))
            warnings.append(Warning(code="UNSELECTED_RESTORED", message=f"The AI changed {section} although it was not selected. The original section was restored."))
    if Counter(tailored.skills) != Counter(original.skills):
        reject("skills were added, removed, or changed.")
    if numbers(tailored.summary) - numbers(original.summary):
        reject("the summary contains new numerical claims.")
    for section in ("experience", "projects"):
        before_entries = getattr(original, section)
        after_entries = getattr(tailored, section)
        if [x.id for x in before_entries] != [x.id for x in after_entries]:
            reject(f"{section} entries or chronology changed.")
        for before, after in zip(before_entries, after_entries):
            immutable = ("employer", "title", "location", "start_date", "end_date") if section == "experience" else ("name", "description")
            if any(getattr(before, f) != getattr(after, f) for f in immutable):
                reject(f"protected fields in {section} changed.")
            if Counter(x.id for x in before.bullets) != Counter(x.id for x in after.bullets):
                reject("bullets were deleted, duplicated, or moved between entries.")
            by_id = {x.id: x for x in before.bullets}
            for bullet in after.bullets:
                source = by_id[bullet.id]
                if bullet.source_excerpt != source.source_excerpt:
                    reject("a bullet's source reference changed.")
                if numbers(bullet.text) != numbers(source.text):
                    reject("a bullet's numerical achievements changed.")
    # Known JD terms absent from the original cannot be inserted by tailoring.
    from app.exports import resume_text
    from app.scoring import contains_term
    output_text = resume_text(tailored)
    for keyword in keywords:
        if not contains_term(original_text, keyword) and contains_term(output_text, keyword):
            reject("a job requirement absent from the source was inserted.")
    warnings.append(Warning(code="REVIEW_REQUIRED", message="Automated checks protect key fields and metrics, but cannot prove every paraphrase. Review each change against its source before downloading."))
    return warnings


def build_changes(before: Resume, after: Resume, sections: list[str]) -> list[Change]:
    changes = []
    for section in sections:
        if section in {"summary", "skills"}:
            old = getattr(before, section)
            new = getattr(after, section)
            if old != new:
                old_text = " · ".join(old) if isinstance(old, list) else old
                new_text = " · ".join(new) if isinstance(new, list) else new
                changes.append(Change(section=section, entry_id=section, kind="reordered" if section == "skills" else "rewritten", before=old_text, after=new_text, explanation="Existing skills prioritized for this role." if section == "skills" else "Existing qualifications emphasized for this role; review the wording.", source_excerpt=old_text))
        else:
            for old_entry, new_entry in zip(getattr(before, section), getattr(after, section)):
                old_ids = [b.id for b in old_entry.bullets]
                for index, bullet in enumerate(new_entry.bullets):
                    old_bullet = next(b for b in old_entry.bullets if b.id == bullet.id)
                    if bullet.text != old_bullet.text or old_ids.index(bullet.id) != index:
                        kind = "rewritten" if bullet.text != old_bullet.text else "reordered"
                        changes.append(Change(section=section, entry_id=bullet.id, kind=kind, before=old_bullet.text, after=bullet.text, explanation="Rephrased using the original evidence; review for equivalent meaning." if kind == "rewritten" else "Existing bullet moved within its original entry.", source_excerpt=old_bullet.source_excerpt))
    return changes
