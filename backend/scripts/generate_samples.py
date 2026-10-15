"""Generate synthetic, non-sensitive documents used by sample mode and tests."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.exports import docx_bytes, pdf_bytes, resume_text
from tests.fixtures import JD, sample_resume

resume = sample_resume()
samples = ROOT / "samples"
public = ROOT / "frontend" / "public" / "samples"
samples.mkdir(exist_ok=True)
public.mkdir(parents=True, exist_ok=True)
for directory in (samples, public):
    (directory / "alex-morgan.docx").write_bytes(docx_bytes(resume))
    (directory / "job-description.txt").write_text(JD, encoding="utf-8")
(samples / "alex-morgan.pdf").write_bytes(pdf_bytes(resume))
(samples / "alex-morgan.txt").write_text(resume_text(resume), encoding="utf-8")
(samples / "resume.json").write_text(json.dumps(resume.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
print("Generated synthetic PDF, DOCX, text, JSON, and sample JD.")
