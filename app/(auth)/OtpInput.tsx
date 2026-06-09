"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type OtpInputHandle = { focusFirst: () => void };

type Props = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
};

// Segmented 6-digit input. `value` is the compact string of digits entered so
// far (index = box position); `onChange` receives the updated string.
const OtpInput = forwardRef<OtpInputHandle, Props>(function OtpInput(
  { value, onChange, length = 6, disabled = false, invalid = false },
  ref
) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("");

  useImperativeHandle(ref, () => ({
    focusFirst: () => refs.current[0]?.focus(),
  }));

  function focusBox(i: number) {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  }

  function handleChange(i: number, raw: string) {
    const chars = raw.replace(/\D/g, "").split("");
    if (chars.length === 0) return;

    const next = value.split("");
    let idx = i;
    for (const c of chars) {
      if (idx >= length) break;
      next[idx] = c;
      idx++;
    }
    onChange(next.join("").slice(0, length));
    focusBox(idx);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = value.split("");
      if (arr[i]) {
        arr[i] = "";
        onChange(arr.join("").replace(/\s+$/g, ""));
      } else if (i > 0) {
        arr[i - 1] = "";
        onChange(arr.join(""));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!text) return;
    onChange(text);
    focusBox(text.length);
  }

  return (
    <div className="otp-input" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`otp-box ${invalid ? "invalid" : ""}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digits[i] ?? ""}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
});

export default OtpInput;
