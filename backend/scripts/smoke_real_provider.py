"""Opt-in real Gemini smoke test. Requires backend/.env; uses only synthetic data."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.accuracy import canonicalize, validate_structure, validate_tailoring
from app.config import get_settings
from app.exports import docx_bytes, pdf_bytes, resume_text
from app.llm import GeminiProvider
from app.prompts import JD_PROMPT, STRUCTURE_PROMPT, SYSTEM_PROMPT
from app.schemas import JobAnalysis, StructuredResume, TailoringOutput


async def main():
    settings = get_settings()
    if not settings.gemini_api_key:
        raise SystemExit("Not run: set GEMINI_API_KEY in backend/.env first. No live-provider verification has occurred.")
    samples = Path(__file__).resolve().parents[2] / "samples"
    original = (samples / "alex-morgan.txt").read_text(encoding="utf-8")
    jd = (samples / "job-description.txt").read_text(encoding="utf-8")
    provider = GeminiProvider(settings)
    structured = await provider.generate(StructuredResume, STRUCTURE_PROMPT, {"original_text": original})
    resume = canonicalize(structured.resume)
    validate_structure(resume, original)
    job = await provider.generate(JobAnalysis, JD_PROMPT, {"job_description": jd})
    sections = ["summary", "skills", "experience", "projects"]
    tailored = await provider.generate(TailoringOutput, SYSTEM_PROMPT, {"original_text": original, "original_resume": resume.model_dump(), "job_description": jd, "job_analysis": job.model_dump(), "selected_sections": sections})
    validate_tailoring(resume, tailored.resume, sections, original, [r.keyword for r in job.requirements])
    assert pdf_bytes(tailored.resume).startswith(b"%PDF")
    assert docx_bytes(tailored.resume).startswith(b"PK")
    print(json.dumps({"result": "passed", "provider": "Google Gemini", "model": settings.gemini_model, "stages": ["structure", "analyze JD", "tailor", "validate", "PDF", "DOCX"]}))


if __name__ == "__main__":
    asyncio.run(main())
