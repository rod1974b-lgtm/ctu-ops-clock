const numbers: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};
const segments = {
  a: "12,4 48,4 54,10 48,16 12,16 6,10",
  b: "50,18 56,12 60,18 56,48 50,54 44,48",
  c: "46,58 52,52 56,58 52,88 46,94 40,88",
  d: "8,90 40,90 46,96 40,102 8,102 2,96",
  e: "4,58 10,52 16,58 12,86 6,92 0,86",
  f: "8,18 14,12 20,18 16,46 10,52 4,46",
  g: "14,48 44,48 50,54 44,60 14,60 8,54",
};
export function CTUDigits({
  value,
  time,
  blink = false,
  className = "",
}: {
  value?: string;
  time?: string;
  blink?: boolean;
  className?: string;
}) {
  const text = value ?? time ?? "00:00:00";
  return (
    <div className={`led-display ${className}`} role="img" aria-label={text}>
      {text.split("").map((char, i) =>
        char === ":" ? (
          <svg
            key={i}
            className={`led-colon ${blink ? "colon-blink" : ""}`}
            viewBox="0 0 18 106"
            aria-hidden="true"
          >
            <rect x="5" y="32" width="8" height="8" />
            <rect x="5" y="70" width="8" height="8" />
          </svg>
        ) : (
          <svg key={i} className="led-digit" viewBox="0 0 62 106" aria-hidden="true">
            {Object.entries(segments).map(([name, points]) => (
              <polygon
                key={name}
                points={points}
                className={numbers[char]?.includes(name) ? "segment-on" : "segment-off"}
              />
            ))}
          </svg>
        ),
      )}
    </div>
  );
}
