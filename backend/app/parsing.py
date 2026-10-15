import io
import re
import zipfile
from pathlib import Path

import pdfplumber
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from pdfminer.pdfdocument import PDFPasswordIncorrect

from app.config import Settings
from app.errors import AppError
from app.schemas import Warning

MIME_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"},
}


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def extract_document(data: bytes, filename: str, content_type: str, settings: Settings) -> tuple[str, list[Warning]]:
    if not data:
        raise AppError("EMPTY_FILE", "This file is empty. Choose a PDF or DOCX with resume text.")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"Choose a file smaller than {settings.max_upload_mb} MB.", 413)
    suffix = Path(filename).suffix.lower()
    if suffix not in MIME_TYPES or content_type.split(";")[0].lower() not in MIME_TYPES.get(suffix, set()):
        raise AppError("UNSUPPORTED_FILE", "Only PDF and DOCX files with a matching content type are supported.", 415)
    warnings: list[Warning] = []
    try:
        if suffix == ".pdf":
            if not data.startswith(b"%PDF-"):
                raise AppError("FILE_TYPE_MISMATCH", "The file contents do not match a PDF document.", 415)
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                if pdf.doc.encryption:
                    raise AppError("ENCRYPTED_PDF", "Remove the PDF password before uploading it.")
                if len(pdf.pages) > settings.max_document_pages:
                    raise AppError("TOO_MANY_PAGES", f"Resumes may contain at most {settings.max_document_pages} pages.")
                texts = [page.extract_text() or "" for page in pdf.pages]
                if any(len(re.sub(r"\s", "", t)) < 20 for t in texts):
                    warnings.append(Warning(code="PARTIAL_EXTRACTION", message="Some PDF pages contain little usable text. Check the preview; OCR is not supported."))
                text = "\n\n".join(texts)
        else:
            if not zipfile.is_zipfile(io.BytesIO(data)):
                raise AppError("FILE_TYPE_MISMATCH", "The file contents do not match a DOCX document.", 415)
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                infos = archive.infolist()
                if len(infos) > 2000 or sum(x.file_size for x in infos) > 25 * 1024 * 1024:
                    raise AppError("DOCUMENT_TOO_COMPLEX", "The expanded DOCX is too large to process safely.")
                names = archive.namelist()
                if "word/document.xml" not in names or "[Content_Types].xml" not in names:
                    raise AppError("FILE_TYPE_MISMATCH", "This ZIP file is not a DOCX document.", 415)
                if any("vbaProject" in name for name in names):
                    raise AppError("UNSUPPORTED_FILE", "Macro-enabled documents are not supported.", 415)
            doc = Document(io.BytesIO(data))
            parts: list[str] = []
            for block in doc.iter_inner_content():
                if isinstance(block, Paragraph):
                    parts.append(block.text)
                elif isinstance(block, Table):
                    for row in block.rows:
                        seen: set[int] = set()
                        cells = []
                        for cell in row.cells:
                            if id(cell._tc) not in seen:
                                seen.add(id(cell._tc))
                                cells.append(cell.text)
                        parts.append(" | ".join(cells))
            text = "\n".join(parts)
            warnings.append(Warning(code="DOCX_LAYOUT", message="Body paragraphs and tables were extracted. Text in headers, footers, shapes, or images may be absent; check the preview."))
    except PDFPasswordIncorrect as exc:
        raise AppError("ENCRYPTED_PDF", "This PDF is password protected. Upload an unlocked PDF or DOCX.") from exc
    except AppError:
        raise
    except Exception as exc:
        if isinstance(exc.__context__, PDFPasswordIncorrect) or (exc.args and isinstance(exc.args[0], PDFPasswordIncorrect)):
            raise AppError("ENCRYPTED_PDF", "This PDF is password protected. Upload an unlocked PDF or DOCX.") from exc
        raise AppError("CORRUPT_DOCUMENT", "This document could not be read. Open it locally and save a new PDF or DOCX.") from exc
    text = normalize_text(text)
    if len(re.sub(r"\s", "", text)) < 40:
        raise AppError("INSUFFICIENT_TEXT", "There is not enough extractable text. OCR is not supported; upload a text-based PDF or DOCX.")
    if len(text) > settings.max_resume_chars:
        raise AppError("RESUME_TOO_LONG", f"Extracted text exceeds {settings.max_resume_chars:,} characters. Shorten the document; it was not truncated.", 413)
    return text, warnings
