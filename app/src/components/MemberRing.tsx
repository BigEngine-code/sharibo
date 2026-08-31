// Purely presentational: after a claim, none of the 5 nodes are highlighted
// as "the one that claimed" — that's the point. From outside the ring, all
// five remain equally plausible; only the demo operator (via the radio
// picker below) ever knows which one actually did.
import { useI18n } from "../i18n.js";

export function MemberRing({
  members,
  revealed,
}: {
  members: { funded: boolean }[];
  revealed: boolean;
}) {
  const { t } = useI18n();
  const radius = 100;
  const fundedCount = members.filter((m) => m.funded).length;
  const ringLabel = revealed
    ? t("ring.label.revealed", { count: members.length })
    : t("ring.label.loading", { count: members.length, funded: fundedCount });
  return (
    <div className="ring-wrap">
      <div className="ring" role="img" aria-label={ringLabel}>
        <div className="ring-center">{revealed ? t("ring.check") : t("ring.pot")}</div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              className={`ring-node ${m.funded ? "funded" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {i + 1}
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
        <p className="ring-caption">{t("ring.caption", { count: members.length })}</p>
      )}
    </div>
  );
}
