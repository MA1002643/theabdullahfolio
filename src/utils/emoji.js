import emoji from "emoji-dictionary";

export function parseGitHubText(text) {
    if (!text) return "";
    return text.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name) => {
        const found = emoji.getUnicode(name);
        return found || match; // fallback to raw text if not found
    });
}
