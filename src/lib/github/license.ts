export interface RootFile {
  path: string;
  content: string;
}

export interface LicenseResult {
  status: "osi-approved" | "proprietary" | "missing";
  spdxId: string | null;
  sourcePath: string | null;
}

const recognizedLicenses: Array<[RegExp, string]> = [
  [/gnu affero general public license[\s\S]*version 3/i, "AGPL-3.0"],
  [/gnu general public license[\s\S]*version 3/i, "GPL-3.0"],
  [/apache license[\s\S]*version 2\.0/i, "Apache-2.0"],
  [
    /permission is hereby granted, free of charge, to any person obtaining a copy/i,
    "MIT",
  ],
  [/redistribution and use in source and binary forms/i, "BSD-3-Clause"],
  [
    /free and unencumbered software released into the public domain/i,
    "Unlicense",
  ],
];

export function classifyRootLicense(files: RootFile[]): LicenseResult {
  const licenseFile = files.find(({ path }) =>
    /^(?:licen[cs]e|copying)(?:[._-].*)?$/i.test(path),
  );
  if (!licenseFile) {
    return { status: "missing", spdxId: null, sourcePath: null };
  }

  const recognized = recognizedLicenses.find(([pattern]) =>
    pattern.test(licenseFile.content),
  );
  if (!recognized) {
    return {
      status: "proprietary",
      spdxId: null,
      sourcePath: licenseFile.path,
    };
  }

  return {
    status: "osi-approved",
    spdxId: recognized[1],
    sourcePath: licenseFile.path,
  };
}
