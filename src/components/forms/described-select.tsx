"use client";

import { useEffect, useRef, useState } from "react";

export interface DescribedSelectOption {
  id: string;
  label: string;
  description: string;
}

export interface DescribedSelectProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: DescribedSelectOption[];
  onChange: (value: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  error?: string;
}

export function DescribedSelect({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
  required,
  invalid,
  describedBy,
  error,
}: DescribedSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const selectedIndex = options.findIndex((option) => option.id === value);
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const descriptionIds = [describedBy, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (open) listboxRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openMenu(index = selectedIndex >= 0 ? selectedIndex : 0) {
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(option: DescribedSelectOption) {
    onChange(option.id);
    closeMenu();
  }

  return (
    <div ref={rootRef} className="described-select-field">
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        ref={triggerRef}
        id={id}
        className="described-select-trigger"
        type="button"
        role="combobox"
        data-placeholder={!selected}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required}
        aria-invalid={invalid || Boolean(error)}
        aria-describedby={descriptionIds || undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Home") {
            event.preventDefault();
            openMenu(0);
          } else if (event.key === "ArrowUp" || event.key === "End") {
            event.preventDefault();
            openMenu(options.length - 1);
          }
        }}
      >
        {selected?.label ?? placeholder}
      </button>
      {open ? (
        <div
          ref={listboxRef}
          id={listboxId}
          className="described-select-listbox"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={
            options[activeIndex]
              ? `${id}-option-${options[activeIndex].id}`
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                Math.min(current + 1, options.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Home") {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActiveIndex(options.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const option = options[activeIndex];
              if (option) selectOption(option);
            } else if (event.key === "Escape") {
              event.preventDefault();
              closeMenu();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          {options.map((option, index) => (
            <div
              id={`${id}-option-${option.id}`}
              key={option.id}
              className="described-select-option"
              data-active={index === activeIndex}
              role="option"
              aria-selected={option.id === value}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              <span className="described-select-option-label">
                {option.label}
              </span>
              <span className="described-select-option-description">
                {option.description}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="described-select-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
