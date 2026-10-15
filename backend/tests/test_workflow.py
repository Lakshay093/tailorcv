import io
from pathlib import Path

import pdfplumber
import pytest
from docx import Document

from app.accuracy import canonicalize, source_token, validate_structure, validate_tailoring
from app.config import Settings
from app.errors import AppError
from app.exports import pdf_bytes, resume_text
from app.schemas import Resume, StructuredResume
from app.scoring import contains_term
from tests.fixtures import JD, sample_resume

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


def payload():
    resume = sample_resume()
    text = resume_text(resume)
    return {"job_description": JD, "original_text": text, "original_resume": resume.model_dump(), "source_token": source_token(text, resume, Settings().resume_signing_key), "sections": ["summary", "skills", "experience"]}


def test_health_and_complete_http_workflow(client):
    assert client.get("/health").json()["status"] == "ok"
    parsed = client.post("/api/resume/parse", files={"file": ("cv.pdf", (SAMPLES / "alex-morgan.pdf").read_bytes(), "application/pdf")})
    assert parsed.status_code == 200
    data = parsed.json()
    assert data["structured_resume"]["contact"]["email"] == "alex.morgan@example.com"
    assert data["source_token"]
    customized = client.post("/api/resume/customize", json={"job_description": JD, "original_text": data["original_text"], "original_resume": data["structured_resume"], "source_token": data["source_token"], "sections": ["summary", "experience"]})
    assert customized.status_code == 200, customized.text
    result = customized.json()
    assert result["resume"]["contact"] == data["structured_resume"]["contact"]
    assert result["resume"]["skills"] == data["structured_resume"]["skills"]
    assert result["resume"]["projects"] == data["structured_resume"]["projects"]
    assert "Kubernetes" not in resume_text(Resume.model_validate(result["resume"]))
    assert result["suggestions"][0]["keyword"] == "Kubernetes"
    assert result["keyword_analysis"]["original"]["score"] == result["keyword_analysis"]["tailored"]["score"]
    assert any(c["kind"] == "rewritten" for c in result["changes"])
    edited = result["resume"]
    edited["summary"] = "Manually reviewed summary with café and résumé."
    for fmt in ("pdf", "docx", "txt"):
        response = client.post("/api/resume/export", json={"resume": edited, "format": fmt})
        assert response.status_code == 200, response.text
        assert f"tailorcv-resume.{fmt}" in response.headers["content-disposition"]
        if fmt == "pdf":
            assert response.content.startswith(b"%PDF")
            with pdfplumber.open(io.BytesIO(response.content)) as pdf:
                content = "\n".join(p.extract_text() for p in pdf.pages)
        elif fmt == "docx":
            content = "\n".join(p.text for p in Document(io.BytesIO(response.content)).paragraphs)
        else:
            content = response.content.decode()
        assert "Manually reviewed summary with café and résumé." in content
        assert "Confirm first" not in content
        assert "Kubernetes" not in content


@pytest.mark.parametrize("jd", ["short", " " * 120, "x" * 30001])
def test_jd_validation(client, jd):
    data = payload(); data["job_description"] = jd
    response = client.post("/api/resume/customize", json=data)
    assert response.status_code == 422
    assert response.json()["error"]["code"] in {"JD_TOO_SHORT", "JD_TOO_LONG"}
    assert response.json()["error"]["request_id"]


def test_tampered_original_rejected(client):
    data = payload(); data["original_resume"]["skills"].append("Kubernetes")
    response = client.post("/api/resume/customize", json=data)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SOURCE_CHANGED"


def test_validation_response_does_not_echo_private_data(client):
    response = client.post("/api/resume/customize", json={"private": "sensitive resume secret"})
    assert response.status_code == 422
    assert "sensitive resume secret" not in response.text


@pytest.mark.parametrize("mutation", [
    lambda r: setattr(r.contact, "email", "fake@example.com"),
    lambda r: setattr(r.experience[0], "start_date", "Jan 2010"),
    lambda r: setattr(r.experience[0], "title", "Engineering Manager"),
    lambda r: setattr(r.experience[0].bullets[1], "text", "Reduced response time by 90%."),
    lambda r: r.skills.append("Kubernetes"),
    lambda r: setattr(r, "summary", "Engineer with 20 years of experience."),
    lambda r: setattr(r.experience[0].bullets[0], "text", "Built Kubernetes dashboards used by 120 internal users."),
    lambda r: r.experience[0].bullets.pop(),
])
def test_factual_mutations_rejected(mutation):
    original = sample_resume(); tailored = original.model_copy(deep=True); mutation(tailored)
    with pytest.raises(AppError) as exc:
        validate_tailoring(original, tailored, ["summary", "skills", "experience", "projects"], resume_text(original), ["Kubernetes"])
    assert exc.value.code == "FACTUAL_VALIDATION_FAILED"


def test_unselected_sections_restored_and_flagged():
    original = sample_resume(); tailored = original.model_copy(deep=True)
    tailored.summary = "Changed summary"
    warnings = validate_tailoring(original, tailored, ["skills"], resume_text(original), [])
    assert tailored.summary == original.summary
    assert any(w.code == "UNSELECTED_RESTORED" for w in warnings)


def test_extraction_must_preserve_source_wording():
    original = sample_resume(); original.contact.name = "Invented Candidate"
    with pytest.raises(AppError):
        validate_structure(original, resume_text(sample_resume()))


def test_schema_rejects_arbitrary_markdown():
    with pytest.raises(ValueError):
        StructuredResume.model_validate_json("# Resume\nAlex")


def test_keyword_boundaries():
    assert contains_term("Build C++ and React apps with REST\nAPIs", "C++")
    assert contains_term("REST\nAPIs", "REST APIs")
    assert not contains_term("TypeScript", "R")
    assert not contains_term("reactive", "React")


def test_long_unicode_export_wraps_and_spans_pages():
    resume = sample_resume()
    resume.summary = "Résumé for José: café, naïve, Ελληνικά, кириллица. " + "LongWord" * 80
    resume.additional_sections[0].items = [f"Detailed contribution {i}: " + "Wrapped readable content. " * 12 for i in range(80)]
    content = pdf_bytes(resume)
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        assert len(pdf.pages) > 2
        assert "José" in pdf.pages[0].extract_text()
        assert "Detailed contribution 79" in "\n".join(p.extract_text() for p in pdf.pages)
        for page in pdf.pages:
            assert all(char["x0"] >= 30 and char["x1"] < page.width - 25 for char in page.chars)


def test_unsupported_unicode_pdf_is_explicit():
    resume = sample_resume(); resume.contact.name = "中文"
    with pytest.raises(AppError) as exc:
        pdf_bytes(resume)
    assert exc.value.code == "UNSUPPORTED_PDF_GLYPH"
