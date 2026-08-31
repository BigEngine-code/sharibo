// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
import styles from "./MemberRing.module.css";

export function MemberRing({
  members,
  revealed,
}: {
  members: { funded: boolean }[];
  revealed: boolean;
}) {
  const radius = 100;
  return (
    <div className={styles.ringWrap}>
      <div className={styles.ring}>
        <div className={styles.ringCenter}>{revealed ? "✓" : "pot"}</div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              className={`${styles.ringNode} ${m.funded ? styles.funded : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {i + 1}
            </div>
          );
        })}
        {revealed && (
          <div className={`${styles.ringNode} ${styles.ringRecipient}`} style={{ transform: "translate(0px, -170px)" }}>
            ?
          </div>
        )}
      </div>
      {revealed && (
        <p className={styles.ringCaption}>
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the 5 members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}
