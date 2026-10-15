export type Section = "summary" | "skills" | "experience" | "projects";
export type Contact = {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
};
export type Bullet = { id: string; text: string; source_excerpt: string };
export type Experience = {
  id: string;
  employer: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  bullets: Bullet[];
};
export type Project = {
  id: string;
  name: string;
  description: string;
  bullets: Bullet[];
};
export type Resume = {
  contact: Contact;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: {
    id: string;
    institution: string;
    qualification: string;
    dates: string;
    details: string[];
  }[];
  projects: Project[];
  certifications: string[];
  additional_sections: { id: string; title: string; items: string[] }[];
};
export type ReviewWarning = { code: string; message: string };
export type ParsedResume = {
  original_text: string;
  structured_resume: Resume | null;
  source_token: string | null;
  warnings: ReviewWarning[];
  filename: string;
};
export type Change = {
  section: Section;
  entry_id: string;
  kind: "rewritten" | "reordered";
  before: string;
  after: string;
  explanation: string;
  source_excerpt: string;
};
export type KeywordScore = {
  score: number;
  matched: string[];
  missing: string[];
};
export type TailoredResult = {
  resume: Resume;
  changes: Change[];
  job_analysis: {
    role: string;
    requirements: {
      keyword: string;
      description: string;
      importance: "required" | "preferred";
    }[];
  };
  keyword_analysis: {
    original: KeywordScore;
    tailored: KeywordScore;
    method: string;
  };
  suggestions: {
    keyword: string;
    message: string;
    requires_confirmation: boolean;
  }[];
  warnings: ReviewWarning[];
  model: string;
};
export type Limits = {
  max_upload_mb: number;
  jd_min_chars: number;
  jd_max_chars: number;
  max_resume_chars: number;
};
export type Health = { status: string; ai_configured: boolean; limits: Limits };
