import { google } from "googleapis";
import sanitizeHtml from "sanitize-html";

function extractDocId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getAuth() {
  const raw = process.env.GOOGLE_CREDS_JSON;
  if (!raw) throw new Error("GOOGLE_CREDS_JSON is not set on this deployment.");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

// Google's HTML export carries bold/italic/heading/table-shading as inline
// styles on <span>/<td> rather than semantic tags, so we can't just drop
// `style` wholesale without losing all formatting. Instead we keep a narrow,
// theme-safe allowlist: structural styles (bold, italic, underline, align)
// everywhere, and background-color/color only on table cells, where Google
// always sets both together (self-contained contrast, safe in any theme).
// Plain-text color is never allowed — that's what would go invisible against
// the site's own dark background. Images are stripped: exported <img> src
// URLs point at Google's CDN and commonly 403 outside Google's own viewer.
function cleanDocHtml(raw: string): string {
  const cellColor = {
    "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
    color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
  };
  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "br", "span", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr",
    ],
    allowedAttributes: {
      a: ["href"],
      "*": ["style"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedStyles: {
      "*": {
        "font-weight": [/^(bold|bolder|[5-9]00)$/],
        "font-style": [/^italic$/],
        "text-decoration": [/^underline$/, /^line-through$/],
        "text-align": [/^(left|center|right|justify)$/],
      },
      td: cellColor,
      th: cellColor,
    },
    allowedSchemes: ["http", "https", "mailto"],
    exclusiveFilter: frame => frame.tag === "p" && !frame.text.trim(),
  });
}

export async function fetchDocContentHtml(docUrl: string): Promise<string> {
  const id = extractDocId(docUrl);
  if (!id) throw new Error("Could not find a Google Doc ID in that link.");
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.export({ fileId: id, mimeType: "text/html" }, { responseType: "text" });
  return cleanDocHtml(String(res.data));
}
