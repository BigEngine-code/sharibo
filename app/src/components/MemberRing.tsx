import { useEffect, useState } from "react";

// Reads --ring-radius from CSS custom properties so the ring scales with
// responsive breakpoints without JS hard-coding.
export function useRingRadius(): number {
  const [radius, setRadius] = useState(100);

  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--ring-radius");
      setRadius(parseFloat(value) || 100);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return radius;
}

// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
export function MemberRing({
  members,
  revealed,
}: {
  members: { funded: boolean }[];
  revealed: boolean;
}) {
  const radius = useRingRadius();
  const fundedCount = members.filter((m) => m.funded).length;

  // Build a concise, dynamic summary for assistive technology.
  const ringLabel = revealed
    ? `${members.length}-member circle — pot claimed. Payout recipient is unlinkable to any member.`
    : `${members.length}-member circle, ${fundedCount} of ${members.length} funded, pot not yet claimed.`;

  // id used to associate the post-claim caption with the figure via
  // aria-describedby so VoiceOver reads it as supplementary description.
  const captionId = "ring-caption";

  return (
    <div className="ring-wrap">
      {/*
        role="img" turns the whole ring into a single AT object described by
        aria-label; aria-describedby wires up the visible caption when present.
        All child nodes are aria-hidden — the label already covers their state.
      */}
      <div
        className="ring"
        role="img"
        aria-label={ringLabel}
        {...(revealed ? { "aria-describedby": captionId } : {})}
      >
        <div className="ring-center" aria-hidden="true">
          {revealed ? "✓" : "pot"}
        </div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`ring-node ${m.funded ? "funded" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {i + 1}
            </div>
          );
        })}
        {revealed && (
          <div
            aria-hidden="true"
            className="ring-node ring-recipient"
            style={{ transform: "translate(0px, -170px)" }}
          >
            ?
          </div>
        )}
      </div>
      {revealed && (
        // id matches aria-describedby above; role="note" hints to AT that
        // this is supplementary information attached to the figure.
        <p id={captionId} role="note" className="ring-caption">
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the {members.length} members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}
