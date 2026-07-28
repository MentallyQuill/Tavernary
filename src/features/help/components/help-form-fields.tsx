"use client";

import { useEffect, useId, useRef } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

function describedBy(...ids: Array<string | undefined>) {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function HelpErrorSummary({ errors }: { errors: string[] }) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) summaryRef.current?.focus();
  }, [errors]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={summaryRef}
      className="help-error-summary"
      role="alert"
      tabIndex={-1}
    >
      <p>Please fix the highlighted fields before continuing.</p>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

type HelpTextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  count?: string;
};

export function HelpTextField({
  id,
  label,
  hint,
  error,
  count,
  ...inputProps
}: HelpTextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = count ? `${id}-count` : undefined;

  return (
    <div className="help-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...inputProps}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(
          inputProps["aria-describedby"],
          hintId,
          errorId,
          countId,
        )}
      />
      {hint ? (
        <p className="help-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="help-field-error" id={errorId}>
          {error}
        </p>
      ) : null}
      {count ? (
        <p className="help-count" id={countId} role="status" aria-live="polite">
          {count}
        </p>
      ) : null}
    </div>
  );
}

type HelpTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  count?: string;
};

export function HelpTextArea({
  id,
  label,
  hint,
  error,
  count,
  ...textareaProps
}: HelpTextAreaProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = count ? `${id}-count` : undefined;

  return (
    <div className="help-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...textareaProps}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(
          textareaProps["aria-describedby"],
          hintId,
          errorId,
          countId,
        )}
      />
      {hint ? (
        <p className="help-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="help-field-error" id={errorId}>
          {error}
        </p>
      ) : null}
      {count ? (
        <p className="help-count" id={countId} role="status" aria-live="polite">
          {count}
        </p>
      ) : null}
    </div>
  );
}

export function HelpChoiceGroup({
  legend,
  children,
  error,
}: {
  legend: ReactNode;
  children: ReactNode;
  error?: string;
}) {
  const errorId = useId();

  return (
    <fieldset
      className="help-choice-group"
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{legend}</legend>
      {children}
      {error ? (
        <p className="help-field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
