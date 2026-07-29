const allowedRoles = new Set(["owner", "admin", "maintainer"]);
const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const loginPattern = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const editorKeys = ["github_user_id", "login", "role"];

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exactKeys(value, allowed) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

export function validateTrustedEditorRegistry(registry) {
  const errors = [];
  if (!exactKeys(registry, ["schema_version", "editors"])) {
    errors.push("Trusted editor registry contains unknown properties.");
  }
  if (registry?.schema_version !== 1) {
    errors.push("Trusted editor registry must use schema version 1.");
  }
  if (!Array.isArray(registry?.editors) || registry.editors.length === 0) {
    errors.push("Trusted editor registry must contain at least one editor.");
  }

  const ids = new Set();
  const logins = new Set();
  for (const editor of Array.isArray(registry?.editors)
    ? registry.editors
    : []) {
    if (!exactKeys(editor, editorKeys)) {
      errors.push("Trusted editor entry contains unknown properties.");
    }
    if (!positiveInteger(editor?.github_user_id)) {
      errors.push("Trusted editor GitHub user ID must be a positive integer.");
    } else if (ids.has(editor.github_user_id)) {
      errors.push("Trusted editor GitHub user IDs must be unique.");
    } else {
      ids.add(editor.github_user_id);
    }
    const login =
      typeof editor?.login === "string" ? editor.login.toLowerCase() : "";
    if (!loginPattern.test(editor?.login ?? "")) {
      errors.push("Trusted editor login is invalid.");
    } else if (logins.has(login)) {
      errors.push("Trusted editor logins must be unique case-insensitively.");
    } else {
      logins.add(login);
    }
    if (!allowedRoles.has(editor?.role)) {
      errors.push("Trusted editor role is invalid.");
    }
  }

  return errors.length > 0
    ? { valid: false, errors: [...new Set(errors)] }
    : { valid: true };
}

export function verifyTrustedEditor(input) {
  const registryValidation = validateTrustedEditorRegistry(input?.registry);
  if (!registryValidation.valid) {
    return { authorized: false, reasonCode: "registry-invalid" };
  }
  const actorId = input?.actor?.id;
  const actorLogin = input?.actor?.login;
  if (!positiveInteger(actorId) || !loginPattern.test(actorLogin ?? "")) {
    return { authorized: false, reasonCode: "actor-invalid" };
  }
  const editor = input.registry.editors.find(
    ({ github_user_id: id }) => id === actorId,
  );
  if (!editor) {
    return { authorized: false, reasonCode: "actor-not-trusted" };
  }
  if (
    !trustedAssociations.has(
      typeof input.association === "string"
        ? input.association.toUpperCase()
        : "",
    )
  ) {
    return { authorized: false, reasonCode: "association-not-trusted" };
  }
  return {
    authorized: true,
    actorLogin,
    role: editor.role,
  };
}
