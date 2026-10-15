"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  BriefcaseBusiness,
  ChevronRight,
  PanelLeft,
  Download,
  FileCheck2,
  FileText,
  GitCompareArrows,
  LayoutTemplate,
  LoaderCircle,
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
  const [loadingSample, setLoadingSample] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
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
  const busy = parsing || generating || loadingSample;
  const ready = !!parsed?.structured_resume && !jdError && !!sections.length;
  const dirty = !!(
    result &&
    reviewed &&
    JSON.stringify(result.resume) !== JSON.stringify(reviewed)
  );
  const stale = !!result && resultInput !== JSON.stringify({ jd, sections });

  useEffect(() => {
    getHealth()
      .then((data) => {
        setHealth(data);
        setOffline(false);
      })
      .catch(() => setOffline(true))
      .finally(() => setCheckingConnection(false));
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
      setOffline(false);
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
    if (lock.current || loadingSample) return;
    setLoadingSample(true);
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
    } finally {
      setLoadingSample(false);
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
      setOffline(false);
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
      setOffline(false);
    } catch (e) {
      report(e);
    } finally {
      setDownloading(null);
    }
  }

  function jumpTo(id: string) {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.focus({ preventScroll: true });
  }

  function startOver() {
    setJd("");
    setTouched(false);
    setFile(null);
    setParsed(null);
    setResult(null);
    setReviewed(null);
    setResultInput("");
    setError(null);
    setDragOver(false);
    setEditing(false);
    setTab("tailored");
    setSections(["summary", "skills", "experience", "projects"]);
    resetDialog.current?.close();
    jumpTo("setup");
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <Link className="brand" href="/" aria-label="TailorCV home">
          <span className="brand-icon">
            <FileText size={21} />
            <span />
          </span>
          tailor<span className="brand-cv">cv</span>
          <span className="brand-period">.</span>
        </Link>
        <div className="sidebar-caption">YOUR WORKSPACE</div>
        <a className="sidebar-active" href="#main">
          <PanelLeft size={17} /> Resume studio{" "}
          <span className="nav-indicator" />
        </a>
        <div className="sidebar-session">
          <span className="sidebar-caption">THIS APPLICATION</span>
          <strong>
            {file ? file.name.replace(/\.[^.]+$/, "") : "Your next opportunity"}
          </strong>
          <small>
            {result
              ? "Ready for your review"
              : parsed
                ? "Resume added"
                : "Let’s make it a great fit"}
          </small>
        </div>
        <nav className="sidebar-steps" aria-label="Resume customization steps">
          <button
            className={result ? "done" : "current"}
            onClick={() => jumpTo("setup")}
          >
            <span>
              {parsed?.structured_resume && !jdError ? (
                <Check size={13} />
              ) : (
                "1"
              )}
            </span>
            <div>
              Add your details<small>Resume & target role</small>
            </div>
          </button>
          <button
            className={result ? "current" : ""}
            onClick={() => jumpTo("preview")}
          >
            <span>{result ? <Check size={13} /> : "2"}</span>
            <div>
              Review & refine<small>You have the final say</small>
            </div>
          </button>
          <button disabled={!result} onClick={() => jumpTo("downloads")}>
            <span>3</span>
            <div>
              Download<small>Ready for your next step</small>
            </div>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <strong>Your story stays yours.</strong>
            <p>No account. No resume history stored by TailorCV.</p>
          </div>
          <button
            className="sidebar-help"
            onClick={() => helpDialog.current?.showModal()}
          >
            <CircleHelp size={17} /> How it works <ChevronRight size={14} />
          </button>
          <span className="sidebar-footnote">Made for your next chapter.</span>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <Link className="mobile-brand" href="/" aria-label="TailorCV home">
            <FileText size={20} /> tailorcv<span>.</span>
          </Link>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>Resume studio</strong>
          </div>
          <div className="topbar-actions">
            <span className="session-badge">
              <span /> Session only
            </span>
            <button
              className="help-icon"
              aria-label="How it works"
              onClick={() => helpDialog.current?.showModal()}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main id="main" className="page-container">
          <div className="intro">
            <div>
              <div className="eyebrow">
                <span /> A LITTLE MORE YOU. A LOT MORE RELEVANT.
              </div>
              <h1>
                A better fit for your <span>next role.</span>
              </h1>
              <p>
                Bring your experience. We’ll help the right things stand out.
              </p>
            </div>
            <Button
              variant="outline"
              className="sample-button"
              disabled={busy}
              onClick={loadSample}
            >
              {loadingSample ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              Try sample data <ArrowRight size={14} />
            </Button>
          </div>
          <div className="workspace-context">
            <span>
              <span className="live-dot" />{" "}
              {generating
                ? "Tailoring your resume"
                : parsing
                  ? "Reading your resume"
                  : result
                    ? "Your tailored resume is ready"
                    : ready
                      ? "Ready to make it your own"
                      : parsed?.structured_resume
                        ? "Resume added. Complete your application details."
                        : "Let’s build your next application"}
            </span>
            <button
              disabled={busy || (!file && !jd)}
              onClick={() => resetDialog.current?.showModal()}
            >
              <RotateCcw size={13} /> Start over
            </button>
          </div>
          <div className="mobile-switcher">
            <button onClick={() => jumpTo("setup")}>
              <BriefcaseBusiness size={15} /> Your details
            </button>
            <button onClick={() => jumpTo("preview")}>
              <LayoutTemplate size={15} />{" "}
              {result ? "Review resume" : "Resume preview"}
              <ChevronRight size={14} />
            </button>
          </div>
          {offline && (
            <div className="notice notice-warning">
              <CircleHelp size={17} />
              <p>
                The connection was interrupted. The server may be waking up.
                Your inputs are still here; give it a moment and retry.
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={checkingConnection}
                onClick={() => {
                  setCheckingConnection(true);
                  getHealth()
                    .then((data) => {
                      setHealth(data);
                      setOffline(false);
                    })
                    .catch(report)
                    .finally(() => setCheckingConnection(false));
                }}
              >
                {checkingConnection ? "Connecting…" : "Retry connection"}
              </Button>
            </div>
          )}
          {health && !health.ai_configured && (
            <div className="notice notice-warning">
              <CircleHelp size={17} />
              <p>
                <strong>AI customization is temporarily unavailable.</strong>{" "}
                You can still upload a resume and inspect its extracted text.
              </p>
            </div>
          )}
          {error && (
            <div className="notice notice-error" role="alert">
              <CircleHelp size={18} />
              <div>
                <strong>We couldn’t complete that step</strong>
                <p>{error.message}</p>
                {error.requestId && (
                  <small>Request ID: {error.requestId}</small>
                )}
              </div>
              <button aria-label="Dismiss error" onClick={() => setError(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          <div className="workspace-grid">
            <aside
              id="setup"
              tabIndex={-1}
              className="inputs-panel"
              aria-label="Customization inputs"
            >
              <div className="input-panel-title">
                <div>
                  <h2>Your application</h2>
                  <p>Two inputs. One more relevant resume.</p>
                </div>
                <span className="input-progress">
                  {Number(!!parsed?.structured_resume) + Number(!jdError)} / 2
                  ready
                </span>
              </div>
              <section className="input-section upload-section">
                <div className="section-label">
                  <label htmlFor="resume-file">
                    <span className="tiny-step" aria-hidden="true">
                      1
                    </span>{" "}
                    Your resume
                  </label>
                  <span className="file-types">PDF or DOCX</span>
                </div>
                <p className="field-hint">
                  Start with the experience you already have.
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
                          <span>Choose your resume</span> or drop it here
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

              <section className="input-section">
                <div className="section-label">
                  <label htmlFor="job-description">
                    <span className="tiny-step" aria-hidden="true">
                      2
                    </span>{" "}
                    Job description
                  </label>
                  <span className="required-label">Required</span>
                </div>
                <p className="field-hint">
                  Paste the full job description for the best fit.
                </p>
                <div
                  className={`jd-wrap ${touched && jdError ? "invalid" : ""}`}
                >
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
                        ? "Include the full description for context."
                        : "Responsibilities, skills, qualifications…"}
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

              <section className="input-section selection-section">
                <div className="section-label">
                  <h3>
                    <Sparkles size={15} /> What should we tailor?
                  </h3>
                </div>
                <p className="field-hint">
                  Select what to refine. Everything else stays as it is.
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
                  disabled={busy || !ready}
                  onClick={customize}
                >
                  {generating ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {generating
                    ? "Analyzing JD & tailoring…"
                    : "Customize Resume"}
                  {!generating && <ArrowRight className="button-arrow" />}
                </Button>
                <p className="action-hint" aria-live="polite">
                  {parsing
                    ? "Reading and organizing your experience…"
                    : generating
                      ? "Checking each change against your original."
                      : !parsed?.structured_resume
                        ? "Upload your resume to get started."
                        : jdError
                          ? "Add the job description to continue."
                          : !sections.length
                            ? "Choose at least one section to tailor."
                            : "All set. Let’s make it relevant."}
                </p>
                <small>
                  Your resume and job description are sent to Google Gemini.
                  Review every change before applying.
                </small>
              </div>
            </aside>

            <section
              id="preview"
              tabIndex={-1}
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
                  <h2>{result ? "Your tailored resume" : "Resume preview"}</h2>
                  <p>
                    {result
                      ? "Review it. Make it yours. Send it with confidence."
                      : "Your experience, with a little more direction."}
                  </p>
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
                  <span className="eyebrow">
                    GREAT EXPERIENCE. THE RIGHT WORDS.
                  </span>
                  <h3>Making your experience count.</h3>
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
                        {result.changes.length} wording improvements · Based on
                        your original experience
                      </p>
                    </div>
                    <CheckCheck size={20} className="text-emerald-600" />
                  </div>
                  {stale && (
                    <div className="inline-note">
                      Your inputs have changed. Customize again to create a
                      result for the current JD and section selection.
                    </div>
                  )}
                  <div className="score-strip">
                    <div>
                      <span className="score-label">
                        KEYWORD MATCH ESTIMATE
                      </span>
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
                  <div className="download-bar" id="downloads" tabIndex={-1}>
                    <div>
                      <Download size={16} />
                      <span>
                        {dirty
                          ? "Download with your edits"
                          : "Download your resume"}
                        <small>Clean formatting. Only your resume.</small>
                      </span>
                    </div>
                    <div className="download-buttons">
                      {(["pdf", "docx", "txt"] as const).map((format) => (
                        <Button
                          key={format}
                          variant={format === "pdf" ? "default" : "outline"}
                          size="sm"
                          aria-disabled={!!downloading}
                          aria-busy={downloading === format}
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
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList aria-label="Result views">
                      <TabsTrigger value="tailored">
                        Tailored Resume
                      </TabsTrigger>
                      <TabsTrigger value="original">Original</TabsTrigger>
                      <TabsTrigger value="changes">
                        Changes{" "}
                        <span className="tab-count">
                          {result.changes.length}
                        </span>
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
                          Edits are yours to verify. All downloads use the
                          current fields below.
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
                            <p className="change-reason">
                              {change.explanation}
                            </p>
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
                            {!result.keyword_analysis.tailored.matched
                              .length && <p>No exact term matches found.</p>}
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
                            All extracted JD terms are explicitly present in
                            your original resume.
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
                </>
              ) : parsed?.structured_resume ? (
                <>
                  <div className="preview-note">
                    <FileCheck2 size={17} />
                    <div>
                      <strong>Your experience is in.</strong>
                      <p>
                        {jdError
                          ? "Add a job description to tailor this resume to the role."
                          : "Choose your sections, then customize to see the difference."}
                      </p>
                    </div>
                  </div>
                  <div className="document-toolbar">
                    <span>
                      <span className="document-dot" /> Original resume · Before
                      tailoring
                    </span>
                    <span>Preview</span>
                  </div>
                  <div className="document-surface original-preview">
                    <ResumeView resume={parsed.structured_resume} />
                  </div>
                </>
              ) : (
                <div className="empty-workspace">
                  <div className="preview-grid" aria-hidden="true">
                    <span className="preview-label">
                      <span /> A little more relevant
                    </span>
                    <div className="preview-sheet">
                      <div className="preview-sheet-top">
                        <div className="preview-monogram">
                          <FileText size={24} strokeWidth={1.4} />
                        </div>
                        <div>
                          <i />
                          <i />
                        </div>
                      </div>
                      <div className="preview-rule" />
                      {[0, 1, 2].map((n) => (
                        <div className="preview-block" key={n}>
                          <b />
                          <i />
                          <i />
                          <i />
                        </div>
                      ))}
                      <span className="preview-page-number">
                        01 / YOUR NEXT CHAPTER
                      </span>
                    </div>
                    <div className="preview-stamp">
                      <Check size={14} /> Your experience. Better expressed.
                    </div>
                  </div>
                  <div className="empty-copy">
                    <span className="empty-eyebrow">
                      A STRONGER FIRST IMPRESSION
                    </span>
                    <h3>
                      Your story deserves
                      <br />
                      the right words.
                    </h3>
                    <p>
                      Upload your resume and add a target role.
                      <br />
                      Your tailored version will take shape here.
                    </p>
                    <button
                      className="empty-upload"
                      disabled={busy}
                      onClick={() => picker.current?.click()}
                    >
                      Add your resume <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="preview-promises">
                    <span>
                      <ShieldCheck size={15} /> Facts stay factual
                    </span>
                    <span>
                      <Pencil size={14} /> Every word is editable
                    </span>
                    <span>
                      <Download size={14} /> Export in 3 formats
                    </span>
                  </div>
                </div>
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
              <ShieldCheck size={14} /> Real experience. Relevant words. Always
              you.
            </span>
            <button onClick={() => helpDialog.current?.showModal()}>
              How TailorCV works <ChevronRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <dialog
        ref={helpDialog}
        className="app-dialog"
        aria-labelledby="help-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) helpDialog.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="dialog-icon">
            <Sparkles size={22} />
          </span>
          <button
            className="help-icon"
            aria-label="Close help"
            onClick={() => helpDialog.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <span className="eyebrow">A LITTLE GUIDANCE</span>
        <h2 id="help-title">
          Your next application,
          <br />
          with more intention.
        </h2>
        <p>
          TailorCV helps you express the experience you already have in the
          language of your next role.
        </p>
        <ol className="help-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Bring your experience</strong>
              <p>
                Upload a text-based PDF or DOCX, then paste the job description.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Make it relevant</strong>
              <p>
                Choose the sections to tailor. Compare every change, review
                suggestions, and edit the final wording.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Take the next step</strong>
              <p>
                Download your reviewed resume as a PDF, DOCX, or plain text
                file.
              </p>
            </div>
          </li>
        </ol>
        <div className="dialog-privacy">
          <ShieldCheck size={19} />
          <p>
            TailorCV keeps no resume history. Your resume and job description
            are sent to Google Gemini for processing. Refreshing the page clears
            this workspace.
          </p>
        </div>
        <Button
          className="dialog-cta"
          onClick={() => helpDialog.current?.close()}
        >
          Got it, let’s get started <ArrowRight size={16} />
        </Button>
      </dialog>
      <dialog
        ref={resetDialog}
        className="app-dialog reset-dialog"
        aria-labelledby="reset-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) resetDialog.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="dialog-icon">
            <RotateCcw size={22} />
          </span>
          <button
            className="help-icon"
            aria-label="Close reset confirmation"
            onClick={() => resetDialog.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="reset-title">Start a new application?</h2>
        <p>
          This clears the resume, job description, and edits in this workspace.
          Download anything you want to keep first.
        </p>
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => resetDialog.current?.close()}
          >
            Keep working
          </Button>
          <Button onClick={startOver}>
            Start fresh <ArrowRight size={15} />
          </Button>
        </div>
      </dialog>
    </div>
  );
}
