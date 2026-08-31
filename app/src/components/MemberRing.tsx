// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
import type { Member } from "../types.js";

export function MemberRing({
  members,
  revealed,
}: {
  members: Member[];
  revealed: boolean;
}) {
  const radius = 100;
  return (
    <div className="ring-wrap">
      <div className="ring">
        <div className="ring-center">{revealed ? "✓" : "pot"}</div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              className={`ring-node ${m.funded ? "funded" : ""} ${m.ineligible ? "ineligible" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
              aria-label={`member ${i + 1}${m.ineligible ? ", ineligible: already claimed" : ""}`}
            >
              {m.ineligible ? "×" : i + 1}
            </div>
          );
        })}
        {revealed && (
          <div className="ring-node ring-recipient" style={{ transform: "translate(0px, -170px)" }}>
            ?
          </div>
        )}
      </div>
      {revealed && (
        <p className="ring-caption">
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the 5 members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}
