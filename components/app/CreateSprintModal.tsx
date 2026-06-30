"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import DatePicker from "@/components/app/DatePicker";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Duration presets (in weeks). "custom" lets the user pick the end date freely.
const DURATIONS = [
  { value: "1", label: "1 Week" },
  { value: "2", label: "2 Weeks" },
  { value: "3", label: "3 Weeks" },
  { value: "4", label: "4 Weeks" },
  { value: "custom", label: "Custom" },
];

export type EditSprint = {
  id: number;
  name: string;
  goal: string;
  start_date: string | null;
  end_date: string | null;
};

export default function CreateSprintModal({
  projectId,
  sprint,
  onClose,
  onCreated,
}: {
  projectId: number;
  sprint?: EditSprint; // present = edit mode
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!sprint;
  const [name, setName] = useState(sprint?.name ?? "");
  // Editing keeps the saved dates (Custom); creating defaults to a 2-week sprint.
  const [duration, setDuration] = useState(isEdit ? "custom" : "2");
  const [startDate, setStartDate] = useState(
    sprint?.start_date ?? todayISO()
  );
  const [endDate, setEndDate] = useState(
    sprint?.end_date ?? addDays(todayISO(), 14)
  );
  const [description, setDescription] = useState(sprint?.goal ?? "");
  const [autoStart, setAutoStart] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Picking a preset duration recomputes the end date from the start date.
  function changeDuration(value: string) {
    setDuration(value);
    if (value !== "custom") {
      setEndDate(addDays(startDate, Number(value) * 7));
    }
  }
  // Moving the start date keeps the chosen duration (unless custom).
  function changeStart(value: string) {
    setStartDate(value);
    if (duration !== "custom" && value) {
      setEndDate(addDays(value, Number(duration) * 7));
    }
  }
  // Editing the end date directly switches to custom.
  function changeEnd(value: string) {
    setEndDate(value);
    setDuration("custom");
  }

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = isEdit
      ? await fetch(`/api/sprints/${sprint!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            goal: description.trim(),
            start_date: startDate || null,
            end_date: endDate || null,
          }),
        })
      : await fetch("/api/sprints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            name: name.trim(),
            goal: description.trim(),
            start_date: startDate || null,
            end_date: endDate || null,
            auto_start: autoStart,
          }),
        });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || `Could not ${isEdit ? "save" : "create"} the sprint.`);
      return;
    }
    onCreated();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal task-modal sprint-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="tm-head tm-head-x">
          <h2>{isEdit ? "Edit Sprint" : "Create Sprint"}</h2>
          <button
            type="button"
            className="sprint-x"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="tm-body">
          <div className="field">
            <label>Sprint Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Onethread Redesign"
            />
          </div>

          <div className="field">
            <label>Duration</label>
            <div className="cf-select-wrap">
              <select
                className="cf-input"
                value={duration}
                onChange={(e) => changeDuration(e.target.value)}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <svg className="cf-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          <div className="field">
            <label>Duration</label>
            <div className="field-row">
              <DatePicker
                value={startDate}
                onChange={changeStart}
                placeholder="Start date"
              />
              <DatePicker
                value={endDate}
                onChange={changeEnd}
                min={startDate || undefined}
                placeholder="End date"
              />
            </div>
          </div>

          <div className="field">
            <label>Sprint Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter your description..."
            />
          </div>

          {!isEdit && (
            <div className="sprint-toggle-row">
              <div className="sprint-toggle-text">
                <div className="sprint-toggle-title">Sprint Auto Start</div>
                <div className="sprint-toggle-sub">
                  Sprints kick off automatically on their designated starting dates.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoStart}
                className={`sw-toggle${autoStart ? " on" : ""}`}
                onClick={() => setAutoStart((v) => !v)}
              >
                <span className="sw-knob" />
              </button>
            </div>
          )}

          {error && <p className="invite-err">{error}</p>}
        </div>

        <div className="modal-actions sprint-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || !name.trim()}
          >
            {saving ? <Spinner /> : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
