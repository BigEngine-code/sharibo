import { explorerTx, short } from "../lib/explorer.js";
import type { Member } from "../types.js";

export function FundingList({
  members,
  busy,
  round,
  contributionXlm,
  onFund,
}: {
  members: Member[];
  busy: string | null;
  round: number;
  contributionXlm: number;
  onFund: (i: number) => void;
}) {
  return (
    <>
      <h2>Fund</h2>
      <div className="members">
        {members.map((m, i) => (
          <div key={i} className={`member ${m.funded ? "funded" : ""}`}>
            <span className="member-addr">
              member {i + 1} · {short(m.keypair.publicKey())}
            </span>
            {m.funded ? (
              <a className="link" href={explorerTx(m.fundHash!)} target="_blank" rel="noreferrer">
                ✓ funded ↗
              </a>
            ) : (
              <button
                className="btn btn-small"
                disabled={!!busy || round > 0}
                onClick={() => onFund(i)}
              >
                Fund {contributionXlm} XLM
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function FundingListSkeleton() {
  return (
    <div aria-hidden="true">
      <h2>Fund</h2>
      <div className="members">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="member skeleton-member-row">
            <span className="skeleton skeleton-text" style={{ width: `${140 + i * 12}px` }} />
            <span className="skeleton skeleton-text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
