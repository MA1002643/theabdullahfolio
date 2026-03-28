export function detectChanges(oldData, newData) {
    const changed = new Set();

    function checkDiff(oldObj, newObj, path = "") {
        for (const key in newObj) {
            const newPath = path ? `${path}.${key}` : key;

            if (typeof newObj[key] === "object" && newObj[key] !== null) {
                checkDiff(oldObj?.[key], newObj[key], newPath);
            } else {
                if (oldObj?.[key] !== newObj[key]) {
                    const pathParts = newPath.split(".");

                    // 🧠 If top-level key only, e.g. "languages"
                    if (pathParts.length === 1) {
                        changed.add(pathParts[0]);
                    }
                    // 🧠 If nested like "stats.commits" → include second level
                    else if (pathParts.length >= 2) {
                        changed.add(`${pathParts[0]}.${pathParts[1]}`);
                    }
                }
            }
        }
    }

    checkDiff(oldData, newData);
    return Array.from(changed);
}
