"use client";

import { useMemo } from "react";
import {
  MODULES,
  ACTIONS,
  MODULE_LABELS,
  ACTION_LABELS,
  VALID_ACTIONS,
  isValidPermission,
  permKey,
  type Module,
  type Action,
} from "@/lib/permissions";

// Reusable permission matrix: rows are modules, columns are actions. A checkbox
// renders only for valid (module, action) pairs; invalid cells are blank. The
// value is a Set of "module:action" keys; onChange returns the next Set.
//
// When `readOnly` is true (e.g. the locked Admin role) the checkboxes are
// disabled but still reflect the granted set.
export default function PermissionMatrix({
  value,
  onChange,
  readOnly = false,
}: {
  value: Set<string>;
  onChange?: (next: Set<string>) => void;
  readOnly?: boolean;
}) {
  // Only show action columns that apply to at least one module, in canonical order.
  const columns = useMemo(() => {
    const used = new Set<Action>();
    for (const m of MODULES) for (const a of VALID_ACTIONS[m]) used.add(a);
    return ACTIONS.filter((a) => used.has(a));
  }, []);

  const toggle = (m: Module, a: Action) => {
    if (readOnly || !onChange) return;
    const key = permKey(m, a);
    const next = new Set(value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  // Toggle every valid permission in a module row on/off.
  const toggleRow = (m: Module) => {
    if (readOnly || !onChange) return;
    const keys = VALID_ACTIONS[m].map((a) => permKey(m, a));
    const allOn = keys.every((k) => value.has(k));
    const next = new Set(value);
    for (const k of keys) {
      if (allOn) next.delete(k);
      else next.add(k);
    }
    onChange(next);
  };

  const rowAllChecked = (m: Module) =>
    VALID_ACTIONS[m].every((a) => value.has(permKey(m, a)));

  return (
    <div className="perm-matrix-wrap">
      <table className="perm-matrix">
        <thead>
          <tr>
            <th className="perm-matrix-corner">Module</th>
            {columns.map((a) => (
              <th key={a} className="perm-matrix-col">
                <span>{ACTION_LABELS[a]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => (
            <tr key={m}>
              <th className="perm-matrix-row" scope="row">
                <span className="perm-matrix-row-name">{MODULE_LABELS[m]}</span>
                {!readOnly && (
                  <button
                    type="button"
                    className="perm-matrix-all"
                    onClick={() => toggleRow(m)}
                  >
                    {rowAllChecked(m) ? "None" : "All"}
                  </button>
                )}
              </th>
              {columns.map((a) => {
                const valid = isValidPermission(m, a);
                const key = permKey(m, a);
                const checked = value.has(key);
                return (
                  <td key={a} className="perm-matrix-cell">
                    {valid ? (
                      <label className="perm-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={() => toggle(m, a)}
                          aria-label={`${MODULE_LABELS[m]} — ${ACTION_LABELS[a]}`}
                        />
                        <span className="perm-checkbox-box" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 12 5 5L20 6" />
                          </svg>
                        </span>
                      </label>
                    ) : (
                      <span className="perm-matrix-na" aria-hidden>
                        –
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
