/** Strings longer than this (e.g. base64 content parts) start folded. */
const LONG_STRING = 200;

/** Objects and arrays from this depth on start collapsed. */
const OPEN_DEPTH = 2;

/**
 * Collapsible JSON view on native <details>. Takes JSON-safe data: run it
 * through JSON.parse(JSON.stringify(x)) first so Dates become strings.
 */
export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="font-mono text-xs leading-5">
      <JsonNode value={value} depth={0} />
    </div>
  );
}

function Key({ name }: { name?: string | number }) {
  if (name === undefined) return null;
  return typeof name === "number" ? (
    <span className="text-muted-foreground">{name}: </span>
  ) : (
    <span className="text-sky-700 dark:text-sky-300">
      {JSON.stringify(name)}:{" "}
    </span>
  );
}

function JsonNode({
  name,
  value,
  depth,
}: {
  name?: string | number;
  value: unknown;
  depth: number;
}) {
  if (value === null || typeof value !== "object")
    return (
      <div>
        <Key name={name} />
        <Scalar value={value} />
      </div>
    );

  const isArray = Array.isArray(value);
  const entries = Object.entries(value);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0)
    return (
      <div>
        <Key name={name} />
        {open + close}
      </div>
    );

  return (
    // The "… }" hint only shows while folded.
    <details
      open={depth < OPEN_DEPTH}
      className="[&[open]>summary>.hint]:hidden"
    >
      <summary className="cursor-pointer select-none hover:bg-muted">
        <Key name={name} />
        {open}
        <span className="hint text-muted-foreground">
          {" … "}
          {close} {entries.length} {isArray ? "items" : "keys"}
        </span>
      </summary>
      <div className="ml-1.5 border-l pl-3">
        {entries.map(([k, v]) => (
          <JsonNode
            key={k}
            name={isArray ? Number(k) : k}
            value={v}
            depth={depth + 1}
          />
        ))}
      </div>
      <div>{close}</div>
    </details>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (typeof value === "string") {
    const text = JSON.stringify(value);
    if (value.length <= LONG_STRING)
      return (
        <span className="break-all text-emerald-700 dark:text-emerald-300">
          {text}
        </span>
      );
    return (
      <details className="inline [&[open]>summary>.hint]:hidden">
        <summary className="inline cursor-pointer text-emerald-700 dark:text-emerald-300">
          <span className="hint">
            {text.slice(0, 60)}…{" "}
            <span className="text-muted-foreground">
              ({value.length.toLocaleString()} chars)
            </span>
          </span>
        </summary>
        <span className="break-all text-emerald-700 dark:text-emerald-300">
          {text}
        </span>
      </details>
    );
  }
  return (
    <span
      className={
        typeof value === "number"
          ? "text-amber-700 dark:text-amber-300"
          : "text-violet-700 dark:text-violet-300"
      }
    >
      {String(value)}
    </span>
  );
}
