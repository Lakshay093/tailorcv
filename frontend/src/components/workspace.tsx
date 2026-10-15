"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  GitCompareArrows,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResumeView } from "@/components/resume-view";
import {
  ApiError,
  customizeResume,
  downloadResume,
  getHealth,
  parseResume,
} from "@/lib/api";
import type {
  Health,
  Limits,
  ParsedResume,
  Resume,
  Section,
  TailoredResult,
} from "@/lib/types";

const DEFAULT_LIMITS: Limits = {
  max_upload_mb: 5,
  jd_min_chars: 100,
  jd_max_chars: 30000,
  max_resume_chars: 50000,
};
const SECTIONS: { key: Section; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "skills", label: "Skills" },
  { key: "experience", label: "Experience" },
  { key: "projects", label: "Projects" },
];

export function Workspace() {
  const [jd, setJd] = useState("");
  const [touched, setTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [sections, setSections] = useState<Section[]>([
    "summary",
    "skills",
    "experience",
    "projects",
  ]);
  const [result, setResult] = useState<TailoredResult | null>(null);
  const [reviewed, setReviewed] = useState<Resume | null>(null);
  const [resultInput, setResultInput] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("tailored");
  const picker = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const limits = health?.limits || DEFAULT_LIMITS;
  const jdCount = jd.replace(/\s/g, "").length;
  const jdError =
    jdCount < limits.jd_min_chars
      ? `Add at least ${limits.jd_min_chars} non-whitespace characters (${jdCount} so far).`
      : jd.length > limits.jd_max_chars
        ? `Keep the description under ${limits.jd_max_chars.toLocaleString()} characters.`
        : "";
  const busy = parsing || generating;
  const dirty = !!(
    result &&
    reviewed &&
    JSON.stringify(result.resume) !== JSON.stringify(reviewed)
  );
  const stale = !!result && resultInput !== JSON.stringify({ jd, sections });

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setOffline(true));
  }, []);

  function report(e: unknown) {
    setError(
      e instanceof ApiError
        ? e
        : new ApiError(
            e instanceof Error ? e.message : "Something went wrong. Try again.",
          ),
    );
  }

  async function upload(candidate: File) {
    if (lock.current) return;
    const suffix = candidate.name.toLowerCase().split(".").pop();
    if (!candidate.size)
      return report(
        new ApiError("This file is empty. Choose a resume with text."),
      );
    if (candidate.size > limits.max_upload_mb * 1024 * 1024)
      return report(
        new ApiError(`Choose a file smaller than ${limits.max_upload_mb} MB.`),
      );
    const mime = candidate.type.toLowerCase();
    if (
      !["pdf", "docx"].includes(suffix || "") ||
      (mime &&
        ![
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/octet-stream",
        ].includes(mime))
    )
      return report(new ApiError("Please choose a PDF or DOCX resume."));
    lock.current = true;
    setParsing(true);
    setError(null);
    try {
      const data = await parseResume(candidate);
      setFile(candidate);
      setParsed(data);
      setResult(null);
      setReviewed(null);
      setEditing(false);
      setTab("tailored");
    } catch (e) {
      report(e);
    } finally {
      setParsing(false);
      lock.current = false;
      if (picker.current) picker.current.value = "";
    }
  }

  async function loadSample() {
    if (lock.current) return;
    setError(null);
    try {
      const [job, document] = await Promise.all([
        fetch("/samples/job-description.txt"),
        fetch("/samples/alex-morgan.docx"),
      ]);
      if (!job.ok || !document.ok)
        throw new Error("Sample files couldn’t be loaded. Please try again.");
      setJd(await job.text());
      setTouched(false);
      await upload(
        new File([await document.blob()], "alex-morgan.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );
    } catch (e) {
      report(e);
    }
  }

  async function customize() {
    setTouched(true);
    if (
      lock.current ||
      jdError ||
      !parsed?.structured_resume ||
      !sections.length
    )
      return;
    lock.current = true;
    setGenerating(true);
    setError(null);
    try {
      const data = await customizeResume(parsed, jd, sections);
      setResult(data);
      setReviewed(structuredClone(data.resume));
      setResultInput(JSON.stringify({ jd, sections }));
      setEditing(false);
      setTab("tailored");
      setTimeout(
        () =>
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        100,
      );
    } catch (e) {
      report(e);
    } finally {
      setGenerating(false);
      lock.current = false;
    }
  }

  async function download(format: "pdf" | "docx" | "txt") {
    if (!reviewed || downloading) return;
    setDownloading(format);
    setError(null);
    try {
      await downloadResume(reviewed, format);
    } catch (e) {
      report(e);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label="TailorCV home">
            <span className="brand-icon">
              <FileText size={20} strokeWidth={1.8} />
              <span />
            </span>
            tailor<span className="brand-cv">cv</span>
            <span className="beta">BETA</span>
          </Link>
          <nav aria-label="Main navigation">
            <a className="how-link" href="#how-it-works">
              <CircleHelp size={15} /> How it works
            </a>
            <span className="nav-divider" />
            <span className="private-label">
              <LockKeyhole size={13} /> Your next chapter starts here
            </span>
          </nav>
        </div>
      </header>

      <main id="main" className="page-container">
        <div className="intro">
          <div>
            <div className="eyebrow">
              <span /> BUILT AROUND YOUR EXPERIENCE
            </div>
            <h1>
              Your experience. <span>The right words.</span>
            </h1>
            <p>A resume that speaks to the role, while staying true to you.</p>
          </div>
          <div className="intro-note">
            <span className="note-spark">
              <Sparkles size={18} />
            </span>
            <div>
              One thoughtful edit.
              <br />
              <strong>A new possibility.</strong>
            </div>
            <span className="note-doodle">↗</span>
          </div>
        </div>

        <ol
          id="how-it-works"
          className="stepper"
          aria-label="Resume customization steps"
        >
          <li
            className={
              jdCount >= limits.jd_min_chars && !jdError ? "complete" : "active"
            }
          >
            <span className="step-index">
              {jdCount >= limits.jd_min_chars && !jdError ? (
                <Check size={14} />
              ) : (
                "1"
              )}
            </span>
            <div>
              Add job description<small>Tell us about the opportunity</small>
            </div>
          </li>
          <span className="step-connector" aria-hidden="true" />
          <li
            className={
              parsed?.structured_resume
                ? "complete"
                : jdCount >= limits.jd_min_chars
                  ? "active"
                  : ""
            }
          >
            <span className="step-index">
              {parsed?.structured_resume ? <Check size={14} /> : "2"}
            </span>
            <div>
              Upload your resume<small>Bring your experience</small>
            </div>
          </li>
          <span className="step-connector" aria-hidden="true" />
          <li className={result ? "complete" : ""}>
            <span className="step-index">
              {result ? <Check size={14} /> : "3"}
            </span>
            <div>
              Make it your own<small>Review, refine & download</small>
            </div>
          </li>
        </ol>

        {offline && (
          <div className="notice notice-warning">
            <CircleHelp size={17} />
            <p>
              The backend is currently unreachable. Start the API or check its
              public URL. Your inputs remain on this page.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                getHealth()
                  .then((data) => {
                    setHealth(data);
                    setOffline(false);
                  })
                  .catch(report);
              }}
            >
              Retry connection
            </Button>
          </div>
        )}
        {health && !health.ai_configured && (
          <div className="notice notice-warning">
            <CircleHelp size={17} />
            <p>
              <strong>AI setup needed.</strong> Add GEMINI_API_KEY to the
              backend environment. You can upload a file and inspect its
              extracted text now; AI structuring and customization require the
              key.
            </p>
          </div>
        )}
        {error && (
          <div className="notice notice-error" role="alert">
            <CircleHelp size={18} />
            <div>
              <strong>We couldn’t complete that step</strong>
              <p>{error.message}</p>
              {error.requestId && <small>Request ID: {error.requestId}</small>}
            </div>
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        <div className="workspace-grid">
          <aside className="inputs-panel" aria-label="Customization inputs">
            <div className="input-panel-title">
              <h2>Let’s find your fit</h2>
              <Button
                variant="ghost"
                size="sm"
                className="sample-button"
                disabled={busy}
                onClick={loadSample}
              >
                <Sparkles /> Try sample data
              </Button>
            </div>
            <section className="input-section">
              <div className="section-label">
                <label htmlFor="job-description">
                  <span className="tiny-step" aria-hidden="true">
                    1
                  </span>{" "}
                  Job description
                </label>
                <span className="required-label">Required</span>
              </div>
              <p className="field-hint">Paste the role you have your eye on.</p>
              <div className={`jd-wrap ${touched && jdError ? "invalid" : ""}`}>
                <textarea
                  id="job-description"
                  aria-label="Job description"
                  aria-describedby="jd-help jd-count"
                  aria-invalid={!!(touched && jdError)}
                  placeholder={
                    "Paste the job description here…\n\nInclude responsibilities, required skills, and qualifications for the most relevant results."
                  }
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={busy}
                />
                <div className="jd-meta">
                  <span>
                    {jd.length
                      ? "Looking good? Include the full description."
                      : "A little detail goes a long way"}
                  </span>
                  <span id="jd-count">
                    {jd.length.toLocaleString()} /{" "}
                    {limits.jd_max_chars.toLocaleString()}
                  </span>
                </div>
              </div>
              <p
                id="jd-help"
                className={touched && jdError ? "field-error" : "field-note"}
              >
                {touched && jdError
                  ? jdError
                  : `Minimum ${limits.jd_min_chars} non-whitespace characters`}
              </p>
            </section>

            <section className="input-section upload-section">
              <div className="section-label">
                <label htmlFor="resume-file">
                  <span className="tiny-step" aria-hidden="true">
                    2
                  </span>{" "}
                  Your resume
                </label>
                <span className="file-types">PDF or DOCX</span>
              </div>
              <p className="field-hint">
                The experience you’ve already earned.
              </p>
              <input
                id="resume-file"
                aria-label="Your resume"
                ref={picker}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void upload(selected);
                }}
              />
              {file && !parsing ? (
                <div className="uploaded-file">
                  <div className="file-badge">
                    <FileText size={21} />
                  </div>
                  <div>
                    <strong>{file.name}</strong>
                    <small>
                      {(file.size / 1024).toFixed(1)} KB ·{" "}
                      {parsed?.structured_resume
                        ? "Ready to tailor"
                        : "Text extracted"}
                    </small>
                    <button
                      disabled={busy}
                      className="replace-button"
                      onClick={() => picker.current?.click()}
                    >
                      Replace file
                    </button>
                  </div>
                  <button
                    disabled={busy}
                    aria-label="Remove uploaded resume"
                    className="remove-file"
                    onClick={() => {
                      setFile(null);
                      setParsed(null);
                      setResult(null);
                      setReviewed(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`drop-zone ${dragOver ? "dragging" : ""}`}
                  disabled={busy}
                  onClick={() => picker.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files[0])
                      void upload(e.dataTransfer.files[0]);
                  }}
                  aria-label="Upload resume: choose or drop a PDF or DOCX"
                >
                  <span className="upload-icon">
                    {parsing ? (
                      <LoaderCircle size={23} className="animate-spin" />
                    ) : (
                      <UploadCloud size={24} strokeWidth={1.6} />
                    )}
                  </span>
                  <strong>
                    {parsing ? (
                      "Extracting & structuring…"
                    ) : (
                      <>
                        <span>Click to upload</span> or drag and drop
                      </>
                    )}
                  </strong>
                  <small>
                    {parsing
                      ? "Reading your document with Gemini"
                      : `PDF or DOCX · Up to ${limits.max_upload_mb} MB`}
                  </small>
                </button>
              )}
              {parsed && (
                <details className="extraction-preview">
                  <summary>
                    <FileCheck2 size={14} /> Preview extracted text{" "}
                    <ChevronDown size={14} />
                  </summary>
                  <pre>{parsed.original_text}</pre>
                </details>
              )}
              {parsed?.warnings.map((warning, i) => (
                <p className="parse-warning" key={`${warning.code}-${i}`}>
                  {warning.message}
                </p>
              ))}
              {parsed && !parsed.structured_resume && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="mt-2"
                  onClick={() => {
                    if (file) void upload(file);
                  }}
                >
                  <RotateCcw /> Retry AI structuring
                </Button>
              )}
            </section>

            <section className="input-section selection-section">
              <div className="section-label">
                <h3>
                  <span className="tiny-step">3</span> What should we tailor?
                </h3>
              </div>
              <p className="field-hint">
                Choose the sections to give a little attention.
              </p>
              <div className="section-options">
                {SECTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={sections.includes(key)}
                    disabled={busy}
                    onClick={() =>
                      setSections((current) =>
                        current.includes(key)
                          ? current.filter((s) => s !== key)
                          : [...current, key],
                      )
                    }
                    className={sections.includes(key) ? "selected" : ""}
                  >
                    <span>
                      {sections.includes(key) ? (
                        <Check size={12} strokeWidth={3} />
                      ) : (
                        <Plus size={12} />
                      )}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
              {!sections.length && (
                <p className="field-error">Select at least one section.</p>
              )}
            </section>

            <div className="customize-area">
              <Button
                className="customize-button"
                disabled={
                  busy ||
                  !parsed?.structured_resume ||
                  !sections.length ||
                  !!jdError
                }
                onClick={customize}
              >
                {generating ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {generating ? "Analyzing JD & tailoring…" : "Customize Resume"}
                {!generating && <ArrowRight className="button-arrow" />}
              </Button>
              <p>
                <LockKeyhole size={11} /> No account. No saved resume history.
              </p>
              <small>
                Resume text and job descriptions are sent to Google Gemini for
                AI processing. Review all changes before use.
              </small>
            </div>
          </aside>

          <section
            className="results-panel"
            ref={resultsRef}
            aria-label="Results workspace"
            aria-busy={busy}
          >
            <div className="workspace-heading">
              <div className="workspace-heading-icon">
                <LayoutTemplate size={18} />
              </div>
              <div>
                <h2>Your resume workspace</h2>
                <p>A thoughtful fit, with you in control.</p>
              </div>
              <span className={`status-badge ${result ? "ready" : ""}`}>
                <span />
                {generating
                  ? "Tailoring"
                  : parsing
                    ? "Processing"
                    : result
                      ? "Ready to review"
                      : parsed?.structured_resume
                        ? "Resume added"
                        : "Awaiting your resume"}
              </span>
            </div>

            {generating ? (
              <div className="processing-state" role="status">
                <div className="processing-orbit">
                  <Sparkles size={31} />
                  <span />
                </div>
                <span className="eyebrow">A LITTLE THOUGHTFUL TAILORING</span>
                <h3>Finding the right words.</h3>
                <p>
                  Analyzing the job description, tailoring your selected
                  sections,
                  <br className="desktop-break" /> and checking the result
                  against your original experience.
                </p>
                <div className="processing-details">
                  <LoaderCircle size={15} className="animate-spin" /> Waiting
                  for AI analysis and factual validation
                </div>
                <small>Your experience stays the source of truth.</small>
              </div>
            ) : result && reviewed ? (
              <>
                <div className="result-summary">
                  <div className="match-circle">
                    <Target size={22} />
                  </div>
                  <div>
                    <strong>
                      Tailored for{" "}
                      {result.job_analysis.role || "your next role"}
                    </strong>
                    <p>
                      {result.changes.length} changes · {result.model}
                    </p>
                  </div>
                  <CheckCheck size={20} className="text-emerald-600" />
                </div>
                {stale && (
                  <div className="inline-note">
                    Your inputs have changed. Customize again to create a result
                    for the current JD and section selection.
                  </div>
                )}
                <div className="score-strip">
                  <div>
                    <span className="score-label">KEYWORD MATCH ESTIMATE</span>
                    <div className="score-values">
                      <span>
                        {result.keyword_analysis.original.score}%{" "}
                        <small>original</small>
                      </span>
                      <ArrowRight size={15} />
                      <strong>
                        {result.keyword_analysis.tailored.score}%{" "}
                        <small>tailored</small>
                      </strong>
                    </div>
                  </div>
                  <p>
                    Heuristic estimate, not an official ATS score.
                    {dirty && (
                      <strong>
                        {" "}
                        Based on generated text; edits aren’t rescored.
                      </strong>
                    )}
                  </p>
                </div>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList aria-label="Result views">
                    <TabsTrigger value="tailored">Tailored Resume</TabsTrigger>
                    <TabsTrigger value="original">Original</TabsTrigger>
                    <TabsTrigger value="changes">
                      Changes{" "}
                      <span className="tab-count">{result.changes.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="suggestions">
                      Suggestions{" "}
                      {result.suggestions.length > 0 && (
                        <span className="suggestion-dot" />
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="tailored">
                    <div className="document-toolbar">
                      <span>
                        <span className="document-dot" />
                        {editing
                          ? "Edit your resume below"
                          : dirty
                            ? "Your latest edits are included"
                            : "Single-column · Ready for your review"}
                      </span>
                      <div>
                        {dirty && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setReviewed(structuredClone(result.resume))
                            }
                          >
                            <RotateCcw /> Reset edits
                          </Button>
                        )}
                        <Button
                          variant={editing ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEditing(!editing)}
                        >
                          {editing ? <Check /> : <Pencil />}
                          {editing ? "Done editing" : "Edit resume"}
                        </Button>
                      </div>
                    </div>
                    {editing && (
                      <div className="inline-note">
                        Edits are yours to verify. All downloads use the current
                        fields below.
                      </div>
                    )}
                    <div className="document-surface">
                      <ResumeView
                        resume={reviewed}
                        editing={editing}
                        onChange={setReviewed}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="original">
                    <div className="tab-content">
                      <div className="tab-intro">
                        <FileText size={20} />
                        <div>
                          <h3>Your original, unchanged</h3>
                          <p>
                            Extracted text is the source of truth. Compare it
                            with the tailored version.
                          </p>
                        </div>
                      </div>
                      <pre className="original-text">
                        {parsed?.original_text}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="changes">
                    <div className="tab-content">
                      <div className="tab-intro">
                        <GitCompareArrows size={20} />
                        <div>
                          <h3>Every change, in the open</h3>
                          <p>
                            {dirty
                              ? "These comparisons show the AI-generated version, before your manual edits."
                              : "Compare the wording and check the evidence behind each edit."}
                          </p>
                        </div>
                      </div>
                      {!result.changes.length && (
                        <p className="empty-tab">
                          Your selected sections already fit this role. No
                          wording changes were needed.
                        </p>
                      )}
                      {result.changes.map((change, i) => (
                        <div
                          className="change-card"
                          key={`${change.entry_id}-${i}`}
                        >
                          <div className="change-title">
                            <strong>{change.section}</strong>
                            <span>{change.kind}</span>
                          </div>
                          <div className="change-before">
                            <span>BEFORE</span>
                            <p>
                              <del>{change.before}</del>
                            </p>
                          </div>
                          <div className="change-after">
                            <span>AFTER</span>
                            <p>
                              <ins>{change.after}</ins>
                            </p>
                          </div>
                          <p className="change-reason">{change.explanation}</p>
                          <details>
                            <summary>View source excerpt</summary>
                            <blockquote>{change.source_excerpt}</blockquote>
                          </details>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="suggestions">
                    <div className="tab-content">
                      <div className="tab-intro">
                        <Sparkles size={20} />
                        <div>
                          <h3>Opportunities to consider</h3>
                          <p>
                            Missing terms stay outside your resume. Add them
                            only if your experience supports them.
                          </p>
                        </div>
                      </div>
                      <div className="keyword-group">
                        <h4>Matched in the tailored resume</h4>
                        <div>
                          {result.keyword_analysis.tailored.matched.map(
                            (term) => (
                              <span className="keyword matched" key={term}>
                                <Check size={12} />
                                {term}
                              </span>
                            ),
                          )}
                          {!result.keyword_analysis.tailored.matched.length && (
                            <p>No exact term matches found.</p>
                          )}
                        </div>
                      </div>
                      {result.suggestions.map((s) => (
                        <div className="suggestion-card" key={s.keyword}>
                          <div>
                            <Plus size={15} />
                            <strong>{s.keyword}</strong>
                            <span>Confirm first</span>
                          </div>
                          <p>{s.message}</p>
                        </div>
                      ))}
                      {!result.suggestions.length && (
                        <p className="empty-tab">
                          All extracted JD terms are explicitly present in your
                          original resume.
                        </p>
                      )}
                      <p className="method-note">
                        {result.keyword_analysis.method}
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
                <details className="review-warnings">
                  <summary>
                    <ShieldCheck size={15} /> Review notes (
                    {result.warnings.length}) <ChevronDown size={14} />
                  </summary>
                  {result.warnings.map((w, i) => (
                    <p key={i}>{w.message}</p>
                  ))}
                </details>
                <div className="download-bar">
                  <div>
                    <Download size={16} />
                    <span>
                      {dirty
                        ? "Download with your edits"
                        : "Take the next step"}
                      <small>Analysis stays out of your document.</small>
                    </span>
                  </div>
                  <div className="download-buttons">
                    {(["pdf", "docx", "txt"] as const).map((format) => (
                      <Button
                        key={format}
                        variant={format === "pdf" ? "default" : "outline"}
                        size="sm"
                        disabled={!!downloading}
                        onClick={() => download(format)}
                      >
                        {downloading === format ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <ArrowDown />
                        )}
                        {format.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="empty-tabs" aria-hidden="true">
                  <span className="empty-active">Tailored Resume</span>
                  <span>Original</span>
                  <span>Changes</span>
                  <span>Suggestions</span>
                  <span className="empty-tabs-right">
                    <Pencil size={14} /> Make it yours
                  </span>
                </div>
                <div className="empty-workspace">
                  <div className="preview-composition" aria-hidden="true">
                    <div className="floating-check">
                      <Check size={18} strokeWidth={2.4} />
                    </div>
                    <div className="mini-document">
                      <div className="mini-avatar">AM</div>
                      <div className="mini-name" />
                      <div className="mini-contact" />
                      <div className="mini-rule" />
                      <div className="mini-section" />
                      <div className="mini-line long" />
                      <div className="mini-line" />
                      <div className="mini-line medium" />
                      <div className="mini-section second" />
                      <div className="mini-line long" />
                      <div className="mini-line medium" />
                      <div className="mini-line" />
                    </div>
                    <div className="floating-spark">
                      <Sparkles size={22} strokeWidth={1.7} />
                    </div>
                    <div className="fit-tag">
                      <span /> Made for your next move
                    </div>
                  </div>
                  <div className="empty-copy">
                    <span className="empty-eyebrow">
                      SAME YOU. A SHARPER STORY.
                    </span>
                    <h3>
                      Your next opportunity,
                      <br />
                      meet your experience.
                    </h3>
                    <p>
                      Add a job description and your resume.
                      <br />
                      We’ll help the right things stand out.
                    </p>
                    <div className="empty-pill">
                      <ShieldCheck size={14} /> Your facts stay yours. Always.
                    </div>
                  </div>
                </div>
                <div className="workspace-bottom">
                  <div>
                    <Fingerprint size={19} />
                    <span>
                      <strong>Authentically you</strong>
                      <small>Only your real experience</small>
                    </span>
                  </div>
                  <div>
                    <GitCompareArrows size={19} />
                    <span>
                      <strong>Every edit, explained</strong>
                      <small>You have the final word</small>
                    </span>
                  </div>
                  <div>
                    <Download size={19} />
                    <span>
                      <strong>Ready when you are</strong>
                      <small>PDF, DOCX & plain text</small>
                    </span>
                  </div>
                </div>
              </>
            )}
            <span className="sr-only" role="status" aria-live="polite">
              {parsing
                ? "Extracting and structuring your resume."
                : generating
                  ? "Analyzing job description and tailoring selected sections."
                  : result
                    ? "Your tailored resume is ready to review."
                    : parsed
                      ? "Resume text extracted. Check the parsing preview."
                      : ""}
            </span>
          </section>
        </div>

        <footer className="page-footer">
          <span>
            <ShieldCheck size={14} /> Thoughtful AI. Your experience at the
            center.
          </span>
          <span>
            Built for your next chapter <ArrowUpRight size={13} />
          </span>
        </footer>
      </main>
    </div>
  );
}
