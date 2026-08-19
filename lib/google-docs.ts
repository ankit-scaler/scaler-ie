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

// Google's HTML export wraps every span in inline color/font styles meant for
// their own editor chrome. Dropping style/class (by omitting them from
// allowedAttributes) lets the site's own theme control appearance instead.
// Images are stripped too: exported <img> src URLs point at Google's CDN and
// commonly 403 in a plain <img> tag when the doc isn't link-shareable.
function cleanDocHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr",
    ],
    allowedAttributes: {
      a: ["href"],
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
