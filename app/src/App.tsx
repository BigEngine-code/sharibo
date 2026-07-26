import { CIRCLE_SIZE } from "./config.js";
import { explorerContract } from "./lib/explorer.js";
import { useCircleFlow } from "./hooks/useCircleFlow.js";
import { Stepper } from "./components/Stepper.js";
import { MemberRing } from "./components/MemberRing.js";
import { Landing } from "./components/Landing.js";
import { FundingList } from "./components/FundingList.js";
import { ClaimSection } from "./components/ClaimSection.js";
import { ResultCard } from "./components/ResultCard.js";

export default function App() {
  const flow = useCircleFlow();

  if (flow.screen === "landing") {
    return (
      <Landing
        busy={flow.busy}
        error={flow.error}
        previousCircleId={flow.previousCircleId}
        onLaunch={flow.startCircle}
      />
    );
  }

  const step: 0 | 1 | 2 | 3 = flow.claimResult ? 3 : flow.fullyFunded ? 2 : 1;

  return (
    <div className="page">
      <div className="card">
        <div className="row space-between">
          <h1 className="small">SHARIBO</h1>
          <div className="row">
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              circle #{flow.circleId?.toString()} on-chain ↗
            </a>
            <button
              className="btn btn-small"
              disabled={!!flow.busy}
              onClick={flow.resetToLanding}
              title={`Start over. Your current circle (#${flow.circleId?.toString()}) keeps living on-chain.`}
            >
              Start a new circle
            </button>
          </div>
        </div>

        <Stepper step={step} />

        <MemberRing members={flow.members} revealed={!!flow.claimResult} />

        <div className="pot-bar-wrap">
          <div
            className="pot-bar"
            style={{ width: `${(flow.fundedCount / CIRCLE_SIZE) * 100}%` }}
          />
        </div>
        <p className="pot-label">
          pot: {(Number(flow.pot) / 1e7).toFixed(1)} / {flow.contributionXlm * CIRCLE_SIZE} XLM ·
          round {flow.round}
        </p>

        <FundingList
          members={flow.members}
          busy={flow.busy}
          round={flow.round}
          contributionXlm={flow.contributionXlm}
          onFund={flow.fundMember}
        />

        {flow.fullyFunded && !flow.claimResult && (
          <ClaimSection
            members={flow.members}
            claimantIndex={flow.claimantIndex}
            onSelectClaimant={flow.setClaimantIndex}
            busy={flow.busy}
            onClaim={flow.doClaim}
          />
        )}

        {flow.claimResult && (
          <ResultCard
            claimResult={flow.claimResult}
            rejection={flow.rejection}
            busy={flow.busy}
            onClaimAgain={flow.claimAgain}
            onReset={flow.resetToLanding}
          />
        )}

        {flow.error && <p className="error">{flow.error}</p>}
      </div>
    </div>
  );
}
