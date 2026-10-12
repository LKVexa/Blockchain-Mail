import { sha256Utf8 } from "./sha256.mjs";

                            
       
               
               
                  
               
  

/** Versioned length-prefix frame. The count is UTF-8 bytes of the JSON payload. */
export function frameObject(record              )                                   {
  const payload = canonicalPayload(record);
  const text = `VEM-OBJECT/2\n${utf8Bytes(payload)}\n${payload}`;
  return { text, sha256: sha256Utf8(text) };
}

export function readObject(text        )                                                                                                          {
  if (text.startsWith("VEM-OBJECT/1\n")) return { ok: false, disposition: "legacy" };
  if (!text.startsWith("VEM-OBJECT/2\n")) return { ok: false, disposition: "malformed" };
  const rest = text.slice("VEM-OBJECT/2\n".length);
  const nl = rest.indexOf("\n");
  if (nl < 0) return { ok: false, disposition: "malformed" };
  const count = Number(rest.slice(0, nl));
  if (!Number.isInteger(count) || count < 2) return { ok: false, disposition: "malformed" };
  const payload = rest.slice(nl + 1);
  if (utf8Bytes(payload) !== count) return { ok: false, disposition: "malformed" };
  let parsed         ;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, disposition: "malformed" };
  }
  if (!isRecord(parsed)) return { ok: false, disposition: "malformed" };
  const again = frameObject(parsed);
  if (again.text !== text) return { ok: false, disposition: "malformed" };
  return { ok: true, record: parsed, sha256: sha256Utf8(text) };
}

function canonicalPayload(record              )         {
  return JSON.stringify({
    v: 2,
    from: record.from,
    to: [...record.to].sort(),
    subject: record.subject,
    body: record.body,
  });
}

function isRecord(value         )                        {
  if (!value || typeof value !== "object") return false;
  const row = value                           ;
  return row.v === 2 && typeof row.from === "string" && Array.isArray(row.to) && row.to.every((item) => typeof item === "string") && typeof row.subject === "string" && typeof row.body === "string";
}

function utf8Bytes(text        )         {
  return new TextEncoder().encode(text).length;
}
