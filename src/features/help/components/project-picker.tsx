"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

interface ProjectPickerProps {
  projects: OwnerProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  invalid?: boolean;
}

function projectSearchText(project: OwnerProjectOption) {
  return `${project.name} ${project.repository ?? ""} ${project.id}`.toLocaleLowerCase();
}

function matchingProjects(projects: OwnerProjectOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? projects.filter((project) =>
        projectSearchText(project).includes(normalized),
      )
    : projects;
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  invalid = false,
}: ProjectPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const inputId = `project-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const selected = projects.find((project) => project.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(
    () => matchingProjects(projects, query),
    [projects, query],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function selectProject(project: OwnerProjectOption) {
    onChange(project.id);
    setQuery(project.name);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        open ? Math.min(current + 1, matches.length - 1) : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        open ? Math.max(current - 1, 0) : Math.max(matches.length - 1, 0),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(matches.length - 1, 0));
    } else if (event.key === "Enter" && open) {
      const project = matches[activeIndex];
      if (project) {
        event.preventDefault();
        selectProject(project);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="help-field project-picker">
      <label htmlFor={inputId}>Project</label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        autoComplete="off"
        value={query}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && matches[activeIndex]
            ? `${inputId}-option-${matches[activeIndex].id}`
            : undefined
        }
        aria-invalid={invalid}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          if (value) onChange("");
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
      />
      {open ? (
        <div id={listboxId} className="project-picker-listbox" role="listbox">
          {matches.map((project, index) => (
            <div
              id={`${inputId}-option-${project.id}`}
              key={project.id}
              className="project-picker-option"
              role="option"
              aria-selected={project.id === value}
              data-active={index === activeIndex}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectProject(project)}
            >
              <strong>{project.name}</strong>
              <span className="project-picker-option-identity">
                {[project.repository, project.id].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
          {matches.length === 0 ? (
            <p className="project-picker-empty" role="status">
              No matching projects
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
