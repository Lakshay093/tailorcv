import asyncio
import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response

from app.accuracy import build_changes, canonicalize, source_token, validate_structure, validate_tailoring, verify_source
from app.config import Settings, get_settings
from app.errors import AppError
from app.exports import export_resume, resume_text
from app.llm import GeminiProvider, get_provider
from app.parsing import extract_document
from app.prompts import JD_PROMPT, STRUCTURE_PROMPT, SYSTEM_PROMPT
from app.schemas import CustomizeRequest, CustomizeResponse, ErrorResponse, ExportRequest, JobAnalysis, ParseResponse, StructuredResume, Suggestion, TailoringOutput, Warning
from app.scoring import compare, contains_term

router = APIRouter()
SettingsDep = Annotated[Settings, Depends(get_settings)]
ProviderDep = Annotated[GeminiProvider, Depends(get_provider)]
ERRORS = {code: {"model": ErrorResponse} for code in (400, 413, 415, 422, 429, 502, 503, 504)}


@router.get("/health")
def health(settings: SettingsDep):
    return {"status": "ok", "service": "tailorcv-api", "ai_configured": bool(settings.gemini_api_key), "limits": {"max_upload_mb": settings.max_upload_mb, "jd_min_chars": settings.jd_min_chars, "jd_max_chars": settings.jd_max_chars, "max_resume_chars": settings.max_resume_chars}}


@router.post("/api/resume/parse", response_model=ParseResponse, responses=ERRORS)
async def parse_resume(file: Annotated[UploadFile, File()], settings: SettingsDep, provider: ProviderDep):
    try:
        data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
        filename = (file.filename or "resume").replace("\\", "/").split("/")[-1][:200]
        text, warnings = await asyncio.to_thread(extract_document, data, filename, file.content_type or "", settings)
    finally:
        await file.close()
    try:
        structured = await provider.generate(StructuredResume, STRUCTURE_PROMPT, {"original_text": text})
        resume = canonicalize(structured.resume)
        warnings.extend(structured.warnings)
        warnings.extend(validate_structure(resume, text))
        return ParseResponse(original_text=text, structured_resume=resume, source_token=source_token(text, resume, settings.resume_signing_key), warnings=warnings, filename=filename)
    except AppError as exc:
        # Extraction succeeded independently. Keep the preview usable and explain the AI failure.
        warnings.append(Warning(code=exc.code, message=f"Text extracted, but AI structuring did not complete: {exc.message}"))
        return ParseResponse(original_text=text, structured_resume=None, source_token=None, warnings=warnings, filename=filename)


@router.post("/api/resume/customize", response_model=CustomizeResponse, responses=ERRORS)
async def customize_resume(payload: CustomizeRequest, settings: SettingsDep, provider: ProviderDep):
    jd = payload.job_description.strip()
    if len(re.sub(r"\s", "", jd)) < settings.jd_min_chars:
        raise AppError("JD_TOO_SHORT", f"Add at least {settings.jd_min_chars} non-whitespace characters to the job description.", 422)
    if len(payload.job_description) > settings.jd_max_chars:
        raise AppError("JD_TOO_LONG", f"The job description may contain at most {settings.jd_max_chars:,} characters.", 422)
    if len(payload.original_text) > settings.max_resume_chars:
        raise AppError("RESUME_TOO_LONG", "The original resume exceeds the configured text limit.", 413)
    verify_source(payload.original_text, payload.original_resume, payload.source_token, settings.resume_signing_key)
    job = await provider.generate(JobAnalysis, JD_PROMPT, {"job_description": jd})
    # Reject invented analysis terms rather than scoring against hallucinated keywords.
    unique = {}
    for req in job.requirements:
        if not contains_term(jd, req.keyword):
            raise AppError("INVALID_JOB_ANALYSIS", "AI analysis returned a keyword absent from the JD. Try again.", 502)
        unique.setdefault(req.keyword.casefold(), req)
    job.requirements = list(unique.values())
    output = await provider.generate(TailoringOutput, SYSTEM_PROMPT, {"original_text": payload.original_text, "original_resume": payload.original_resume.model_dump(), "job_description": jd, "job_analysis": job.model_dump(), "selected_sections": payload.sections})
    keywords = [r.keyword for r in job.requirements]
    warnings = validate_tailoring(payload.original_resume, output.resume, payload.sections, payload.original_text, keywords)
    analysis = compare(payload.original_text, resume_text(output.resume), job)
    suggestions = [Suggestion(keyword=term, message=f"{term} is not explicitly present in your original resume. Add it only if you can confirm relevant experience.") for term in keywords if not contains_term(payload.original_text, term)]
    return CustomizeResponse(resume=output.resume, changes=build_changes(payload.original_resume, output.resume, payload.sections), job_analysis=job, keyword_analysis=analysis, suggestions=suggestions, warnings=warnings + output.warnings, model=settings.gemini_model)


@router.post("/api/resume/export", responses=ERRORS, response_class=Response)
async def export(payload: ExportRequest):
    data, mime = await asyncio.to_thread(export_resume, payload.resume, payload.format)
    return Response(content=data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="tailorcv-resume.{payload.format}"', "Cache-Control": "no-store"})
