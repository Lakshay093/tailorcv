from app.schemas import Resume

JD = """Software Engineer, Product Platform

We are looking for a Software Engineer who enjoys building reliable, thoughtful web products. You will work with product designers and engineers to develop customer-facing features and improve our backend services.

Requirements
- Experience building applications with Python, TypeScript, and React.
- Comfortable designing REST APIs and working with PostgreSQL.
- A practical understanding of automated testing and Git.
- Strong collaboration and clear technical communication.

Preferred
- Experience with Docker and Kubernetes.
- Familiarity with accessibility and performance optimization.

Help us build tools that make everyday work simpler. We value curiosity, ownership, and careful attention to the people using our products.
"""


def sample_resume() -> Resume:
    return Resume.model_validate({
        "contact": {"name": "Alex Morgan", "email": "alex.morgan@example.com", "phone": "+1 202 555 0142", "location": "Austin, TX", "links": ["github.com/alexmorgan-example"]},
        "summary": "Software engineer building accessible web applications with TypeScript, React, and Python. Experienced in REST APIs, automated testing, and collaborative product development.",
        "skills": ["TypeScript", "React", "Python", "PostgreSQL", "REST APIs", "Git", "Docker", "automated testing", "accessibility"],
        "experience": [{"id": "experience-1", "employer": "Cedar Labs", "title": "Software Engineer", "location": "Austin, TX", "start_date": "Jun 2022", "end_date": "Present", "bullets": [
            {"id": "experience-1-bullet-1", "text": "Built React and TypeScript dashboards used by 120 internal users.", "source_excerpt": "Built React and TypeScript dashboards used by 120 internal users."},
            {"id": "experience-1-bullet-2", "text": "Developed Python REST APIs backed by PostgreSQL and reduced response time by 25%.", "source_excerpt": "Developed Python REST APIs backed by PostgreSQL and reduced response time by 25%."},
            {"id": "experience-1-bullet-3", "text": "Added automated testing and collaborated with designers on accessibility improvements.", "source_excerpt": "Added automated testing and collaborated with designers on accessibility improvements."},
        ]}],
        "projects": [{"id": "projects-1", "name": "Community Library", "description": "An open-source lending tracker for a neighborhood library.", "bullets": [{"id": "projects-1-bullet-1", "text": "Created a Python application with PostgreSQL and packaged it with Docker.", "source_excerpt": "Created a Python application with PostgreSQL and packaged it with Docker."}]}],
        "education": [{"id": "education-1", "institution": "Hillcrest University", "qualification": "B.S. Computer Science", "dates": "2018 - 2022", "details": []}],
        "certifications": [],
        "additional_sections": [{"id": "additional_sections-1", "title": "Volunteering", "items": ["Mentor at a community coding club."]}],
    })


class MockProvider:
    """Test fixture only. Production never imports or selects this provider."""

    async def generate(self, schema, system, data):
        from app.schemas import JobAnalysis, StructuredResume, TailoringOutput
        if schema is StructuredResume:
            return StructuredResume(resume=sample_resume())
        if schema is JobAnalysis:
            return JobAnalysis(role="Software Engineer, Product Platform", requirements=[{"keyword": k, "description": f"Experience with {k}", "importance": "preferred" if k == "Kubernetes" else "required"} for k in ["Python", "React", "TypeScript", "PostgreSQL", "REST APIs", "Docker", "Kubernetes"]])
        if schema is TailoringOutput:
            from app.schemas import Resume
            result = Resume.model_validate(data["original_resume"])
            if "summary" in data["selected_sections"]:
                result.summary = "Software engineer focused on Python REST APIs and accessible React applications. Brings TypeScript, automated testing, and collaborative product development experience."
            if "skills" in data["selected_sections"]:
                result.skills = sorted(result.skills, key=lambda s: (s != "Python", s))
            if "experience" in data["selected_sections"]:
                result.experience[0].bullets[1].text = "Built Python REST APIs with PostgreSQL, reducing response time by 25%."
            return TailoringOutput(resume=result)
        raise AssertionError(f"Unexpected response schema: {schema}")
