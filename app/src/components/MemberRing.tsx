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
  const radius = 100;
  const center = 170;

  return (
    <div className="ring-wrap">
      <svg
        className="ring"
        viewBox="0 0 340 340"
        width="100%"
        role="img"
        aria-label="Member ring"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="ring-circle"
        />

        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ring-center"
        >
          {revealed ? "✓" : "pot"}
        </text>

        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;

          return (
            <g key={i} className={`ring-node ${m.funded ? "funded" : ""}`}>
              <circle cx={x} cy={y} r="20" />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {revealed && (
          <g className="ring-node ring-recipient">
            <circle cx={center} cy="0" r="20" />
            <text
              x={center}
              y="0"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              ?
            </text>
          </g>
        )}
      </svg>

      {revealed && (
        <p className="ring-caption">
          Payout landed on the address above — cryptographically, it could be
          tied to <em>any</em> of the 5 members in the ring. An outside
          observer cannot tell which.
        </p>
      )}
    </div>
  );
}