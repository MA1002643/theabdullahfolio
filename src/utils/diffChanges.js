// Returns a flat list of changed paths between two objects, capped at
// two levels of nesting. Used by the about-page polling effect to decide
// which subtree of `githubStats` to overwrite and which cards should
// flash the "updated" banner.
//
// Emission shape:
//   - Top-level primitive change → bare key (e.g. "years").
//   - Nested primitive change    → two-level key (e.g. "stats.user",
//                                  "stats.repo") — never the bare parent,
//                                  so the polling effect can update
//                                  subfields selectively without touching
//                                  siblings.
//   - Array change (any depth)   → the path of the array itself
//                                  (e.g. "languages"), treated atomically
//                                  via JSON-string comparison so callers
//                                  don't have to know about flattened
//                                  per-index paths like "languages.0".
export function detectChanges(oldData, newData) {
    const changed = new Set();

    // Emit a changed path under the two-level cap so primitive and array
    // diffs share the same key-shaping rule.
    function addChangedPath(fullPath) {
        const parts = fullPath.split(".");
        if (parts.length === 1) {
            changed.add(parts[0]);
        } else {
            changed.add(`${parts[0]}.${parts[1]}`);
        }
    }

    function checkDiff(oldObj, newObj, path = "") {
        for (const key in newObj) {
            const newPath = path ? `${path}.${key}` : key;
            const newVal = newObj[key];
            const oldVal = oldObj?.[key];

            // Arrays are atomic: emit the array's own path when contents
            // differ, instead of recursing into per-index keys. Without
            // this, an array like `languages` (array of {language, color,
            // size, percentage} objects) flattened to "languages.0" /
            // "languages.1", which no consumer looks for. JSON-string
            // compare is sufficient for the JSON-shaped API payloads this
            // util sees; it normalizes object key order isn't a concern
            // because both sides come from the same API.
            if (Array.isArray(newVal)) {
                if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                    addChangedPath(newPath);
                }
                continue;
            }

            if (typeof newVal === "object" && newVal !== null) {
                checkDiff(oldVal, newVal, newPath);
            } else if (oldVal !== newVal) {
                addChangedPath(newPath);
            }
        }
    }

    checkDiff(oldData, newData);
    return Array.from(changed);
}
