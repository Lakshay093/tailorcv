from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=50_000)


class Contact(Schema):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[str] = Field(default_factory=list, max_length=20)


class Bullet(Schema):
    id: str
    text: str
    source_excerpt: str = Field(description="Exact supporting excerpt from the original extracted text")


class Experience(Schema):
    id: str
    employer: str
    title: str
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    bullets: list[Bullet] = Field(default_factory=list, max_length=100)


class Education(Schema):
    id: str
    institution: str
    qualification: str
    dates: str = ""
    details: list[str] = Field(default_factory=list, max_length=50)


class Project(Schema):
    id: str
    name: str
    description: str = ""
    bullets: list[Bullet] = Field(default_factory=list, max_length=100)


class AdditionalSection(Schema):
    id: str
    title: str
    items: list[str] = Field(default_factory=list, max_length=100)


class Resume(Schema):
    contact: Contact
    summary: str = ""
    skills: list[str] = Field(default_factory=list, max_length=200)
    experience: list[Experience] = Field(default_factory=list, max_length=50)
    education: list[Education] = Field(default_factory=list, max_length=50)
    projects: list[Project] = Field(default_factory=list, max_length=50)
    certifications: list[str] = Field(default_factory=list, max_length=100)
    additional_sections: list[AdditionalSection] = Field(default_factory=list, max_length=30)


class Warning(Schema):
    code: str
    message: str


class StructuredResume(Schema):
    resume: Resume
    warnings: list[Warning] = Field(default_factory=list, max_length=50)


class Requirement(Schema):
    keyword: str = Field(min_length=1, max_length=100)
    description: str
    importance: Literal["required", "preferred"]


class JobAnalysis(Schema):
    role: str
    requirements: list[Requirement] = Field(min_length=1, max_length=40)


Section = Literal["summary", "skills", "experience", "projects"]


class CustomizeRequest(Schema):
    job_description: str = Field(max_length=100_000)
    original_text: str = Field(min_length=40, max_length=100_000)
    original_resume: Resume
    source_token: str = Field(min_length=64, max_length=64)
    sections: list[Section] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def unique_sections(self):
        if len(self.sections) != len(set(self.sections)):
            raise ValueError("Select each section only once")
        return self


class ParseResponse(Schema):
    original_text: str
    structured_resume: Resume | None
    source_token: str | None
    warnings: list[Warning]
    filename: str


class TailoringOutput(Schema):
    resume: Resume
    warnings: list[Warning] = Field(default_factory=list, max_length=50)


class Change(Schema):
    section: Section
    entry_id: str
    kind: Literal["rewritten", "reordered"]
    before: str
    after: str
    explanation: str
    source_excerpt: str


class KeywordScore(Schema):
    score: int
    matched: list[str]
    missing: list[str]


class KeywordAnalysis(Schema):
    original: KeywordScore
    tailored: KeywordScore
    method: str


class Suggestion(Schema):
    keyword: str
    message: str
    requires_confirmation: bool = True


class CustomizeResponse(Schema):
    resume: Resume
    changes: list[Change]
    job_analysis: JobAnalysis
    keyword_analysis: KeywordAnalysis
    suggestions: list[Suggestion]
    warnings: list[Warning]
    model: str


class ExportRequest(Schema):
    resume: Resume
    format: Literal["pdf", "docx", "txt"]


class ErrorDetail(Schema):
    code: str
    message: str
    request_id: str


class ErrorResponse(Schema):
    error: ErrorDetail
