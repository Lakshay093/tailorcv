"use client";
import type { Resume } from "@/lib/types";

function Editable({ value, label, editing, onChange, className = "", multiline = false }: { value: string; label: string; editing: boolean; onChange: (value: string) => void; className?: string; multiline?: boolean }) {
  if (!editing) return <span className={`whitespace-pre-wrap ${className}`}>{value}</span>;
  return multiline ? <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} className={`resume-edit min-h-20 ${className}`} rows={Math.max(2, Math.ceil(value.length / 80))} /> : <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} className={`resume-edit ${className}`} />;
}

export function ResumeView({ resume, editing = false, onChange }: { resume: Resume; editing?: boolean; onChange?: (resume: Resume) => void }) {
  function update(change: (draft: Resume) => void) { const copy = structuredClone(resume); change(copy); onChange?.(copy); }
  const field = (value: string, label: string, change: (draft: Resume, value: string) => void, multiline = false) => <Editable value={value} label={label} editing={editing} onChange={v => update(d => change(d, v))} multiline={multiline} />;
  return <article className="resume-paper" aria-label="Resume document">
    <header className="resume-header">
      <h2>{field(resume.contact.name, "Candidate name", (d, v) => { d.contact.name = v; })}</h2>
      <div className="resume-contact">{(["email", "phone", "location"] as const).filter(k => editing || resume.contact[k]).map(k => <span key={k}>{field(resume.contact[k], `Contact ${k}`, (d, v) => { d.contact[k] = v; })}</span>)}{resume.contact.links.map((link, i) => <span key={i}>{field(link, `Contact link ${i + 1}`, (d, v) => { d.contact.links[i] = v; })}</span>)}</div>
    </header>
    {(resume.summary || editing) && <section><h3>Professional summary</h3><p>{field(resume.summary, "Summary", (d, v) => { d.summary = v; }, true)}</p></section>}
    {(resume.skills.length > 0 || editing) && <section><h3>Skills</h3><p>{field(resume.skills.join(" · "), "Skills separated by middle dots", (d, v) => { d.skills = v.split("·").map(s => s.trim()).filter(Boolean); }, true)}</p>{editing && <small>Separate skills with a middle dot ( · ). Add only skills you can support.</small>}</section>}
    {resume.experience.length > 0 && <section><h3>Experience</h3>{resume.experience.map((entry, i) => <div key={entry.id} className="resume-entry">
      <div className="resume-role"><strong>{field(entry.title, `Job title ${i + 1}`, (d, v) => { d.experience[i].title = v; })}</strong><span className="resume-date">{field(entry.start_date, `Start date ${i + 1}`, (d, v) => { d.experience[i].start_date = v; })} — {field(entry.end_date, `End date ${i + 1}`, (d, v) => { d.experience[i].end_date = v; })}</span></div>
      <div className="resume-employer">{field(entry.employer, `Employer ${i + 1}`, (d, v) => { d.experience[i].employer = v; })}{(entry.location || editing) && <span> · {field(entry.location, `Job location ${i + 1}`, (d, v) => { d.experience[i].location = v; })}</span>}</div>
      <ul>{entry.bullets.map((b, j) => <li key={b.id}>{field(b.text, `Experience ${i + 1} bullet ${j + 1}`, (d, v) => { d.experience[i].bullets[j].text = v; }, true)}</li>)}</ul>
    </div>)}</section>}
    {resume.projects.length > 0 && <section><h3>Projects</h3>{resume.projects.map((p, i) => <div className="resume-entry" key={p.id}><strong>{field(p.name, `Project name ${i + 1}`, (d, v) => { d.projects[i].name = v; })}</strong>{(p.description || editing) && <p>{field(p.description, `Project description ${i + 1}`, (d, v) => { d.projects[i].description = v; }, true)}</p>}<ul>{p.bullets.map((b, j) => <li key={b.id}>{field(b.text, `Project ${i + 1} bullet ${j + 1}`, (d, v) => { d.projects[i].bullets[j].text = v; }, true)}</li>)}</ul></div>)}</section>}
    {resume.education.length > 0 && <section><h3>Education</h3>{resume.education.map((e, i) => <div className="resume-entry" key={e.id}><div className="resume-role"><strong>{field(e.qualification, `Qualification ${i + 1}`, (d, v) => { d.education[i].qualification = v; })}</strong><span className="resume-date">{field(e.dates, `Education dates ${i + 1}`, (d, v) => { d.education[i].dates = v; })}</span></div><p>{field(e.institution, `Institution ${i + 1}`, (d, v) => { d.education[i].institution = v; })}</p>{e.details.map((detail, j) => <p key={j}>{field(detail, `Education detail ${i + 1}.${j + 1}`, (d, v) => { d.education[i].details[j] = v; }, true)}</p>)}</div>)}</section>}
    {resume.certifications.length > 0 && <section><h3>Certifications</h3><ul>{resume.certifications.map((c, i) => <li key={i}>{field(c, `Certification ${i + 1}`, (d, v) => { d.certifications[i] = v; })}</li>)}</ul></section>}
    {resume.additional_sections.map((section, i) => <section key={section.id}><h3>{field(section.title, `Additional section ${i + 1}`, (d, v) => { d.additional_sections[i].title = v; })}</h3>{section.items.map((item, j) => <p key={j}>{field(item, `Additional section ${i + 1} item ${j + 1}`, (d, v) => { d.additional_sections[i].items[j] = v; }, true)}</p>)}</section>)}
  </article>;
}
