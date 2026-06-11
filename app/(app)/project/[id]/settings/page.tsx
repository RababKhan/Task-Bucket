"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CustomField, CustomFieldType } from "@/lib/types";
import Spinner from "@/components/Spinner";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
};

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [optionDraft, setOptionDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/custom-fields?project_id=${projectId}`);
    const data = await res.json();
    setFields(Array.isArray(data) ? data : []);
  }, [projectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const options =
      type === "select"
        ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
        : [];
    await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, name, type, options }),
    });
    setName("");
    setType("text");
    setOptionsText("");
    await load();
  }

  async function patchOptions(field: CustomField, options: string[]) {
    await fetch(`/api/custom-fields/${field.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: field.name, options }),
    });
    await load();
  }

  async function deleteField(field: CustomField) {
    if (!window.confirm(`Delete the "${field.name}" field and its values?`)) return;
    await fetch(`/api/custom-fields/${field.id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="settings-tab">
      <div className="settings-card">
        <div className="settings-card-title">Custom fields</div>
        <p className="settings-card-sub">
          Add fields that appear on every task in this project. Set their values
          on each task&apos;s detail page.
        </p>

        {fields.length === 0 && (
          <p className="cf-empty">No custom fields yet.</p>
        )}

        <ul className="cf-list">
          {fields.map((f) => (
            <li key={f.id} className="cf-item">
              <div className="cf-item-head">
                <span className="cf-name">{f.name}</span>
                <span className="cf-type">{TYPE_LABELS[f.type]}</span>
                <button className="cf-del" onClick={() => deleteField(f)} aria-label="Delete field">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {f.type === "select" && (
                <div className="cf-options">
                  {f.options.map((opt) => (
                    <span key={opt} className="cf-chip">
                      {opt}
                      <button
                        onClick={() => patchOptions(f, f.options.filter((o) => o !== opt))}
                        aria-label={`Remove ${opt}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <span className="cf-add-opt">
                    <input
                      value={optionDraft[f.id] ?? ""}
                      onChange={(e) => setOptionDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                      placeholder="Add value…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = (optionDraft[f.id] ?? "").trim();
                          if (v && !f.options.includes(v)) {
                            patchOptions(f, [...f.options, v]);
                            setOptionDraft((d) => ({ ...d, [f.id]: "" }));
                          }
                        }
                      }}
                    />
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form className="cf-add" onSubmit={addField}>
          <input
            className="cf-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Story points)"
          />
          <select
            className="cf-input cf-type-select"
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
          >
            {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {type === "select" && (
            <input
              className="cf-input"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Options, comma-separated"
            />
          )}
          <button type="submit" className="btn btn-sm btn-primary" disabled={!name.trim()}>
            Add field
          </button>
        </form>
      </div>
    </div>
  );
}
