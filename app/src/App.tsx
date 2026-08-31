import { useRef, useEffect } from "react";
import { useI18n } from "./i18n";
import { useCircleFlow } from "./hooks/useCircleFlow";
import { usePoliteLiveRegion } from "./usePoliteLiveRegion";
import { configError, NETWORK, CIRCLE_SIZE } from "./config";
import { explorerContract } from "./lib/explorer";
import {
  Landing,
  NetworkBanner,
  Stepper,
  MemberRing,
  FundingList,
  ClaimSection,
  ResultCard,
} from "./components/index";

// ── Setup-error screen ──────────────────────────────────────────────────────

function EnvSetupScreen({ errors }: { errors: string[] }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="card hero">
        <h1>SHARIBO</h1>
        <h2 style={{ color: "var(--color-error, #e55)" }}>{t("env.setupRequired")}</h2>
        <p className="sub">
          {t("env.setupIntro")} {t("env.setupHowTo")}
        </p>
        <ul style={{ textAlign: "left", margin: "1rem 0", padding: "0 1.25rem" }}>
          {errors.map((err) => (
            <li key={err} style={{ marginBottom: "0.5rem" }}>
              <code>{err}</code>
            </li>
          ))}
        </ul>
        <p className="fineprint">{t("env.setupDetails")}</p>
      </div>
    </div>
  );
}

// ── Persistent live-region (must stay in DOM) ───────────────────────────────

function LiveRegion({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
    >
      {message}
    </div>
  );
}

// ── ClaimExplainer ──────────────────────────────────────────────────────────

function ClaimExplainer() {
  return (
    <details className="claim-explainer">
      <summary>How this claim proof works</summary>
      <div className="claim-explainer-body">
        <section>
          <h3>What the proof is saying</h3>
          <p>
            It proves the claimant knows a secret identity that is in this circle&apos;s Merkle
            root, and binds that proof to this exact circle and round via the round tag (
            <code>external_nullifier</code>).
          </p>
        </section>
        <section>
          <h3>What stays secret</h3>
          <p>
            Which member generated the proof stays private. The transaction proves valid membership
            without revealing which one of the 5 members claimed.
          </p>
        </section>
        <section>
          <h3>What the contract checks (in order)</h3>
          <ol>
            <li>The round is fully funded: pot equals contribution × size.</li>
            <li>The round tag matches this exact circle and round.</li>
            <li>This nullifier has never claimed before in this circle.</li>
            <li>The Groth16 proof verifies against the circle&apos;s committed root.</li>
          </ol>
        </section>
        <section>
          <h3>What observers can see</h3>
          <p>
            On-chain observers see 5 deposits in and 1 payout out, but no visible link from that
            payout address to a specific member address.
          </p>
        </section>
      </div>
    </details>
  );
}

// ── Root component ───────────────────────────────────────────────────────────

export default function App() {
  const { t } = useI18n();

  // All circle state and on-chain calls live in the hook.
  const flow = useCircleFlow();
  const { announce, message: liveRegionMessage } = usePoliteLiveRegion(120);

  // ── Focus management ──────────────────────────────────────────────────────

  const circleHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (flow.screen === "circle") circleHeadingRef.current?.focus();
  }, [flow.screen]);

  const claimHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (flow.fullyFunded && !flow.claimResult) claimHeadingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.fullyFunded]);

  const payoutHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (flow.claimResult) payoutHeadingRef.current?.focus();
  }, [flow.claimResult]);

  // ── Live-region announcements ─────────────────────────────────────────────

  useEffect(() => {
    if (flow.busy) { announce(`Help: ${flow.busy}`); return; }
    if (flow.claimResult) { announce("Price update complete. The claim result is ready."); return; }
    if (flow.error) { announce(`Error: ${flow.error}`); return; }
    if (flow.fullyFunded) announce("Price update complete. The claim step is ready.");
  }, [announce, flow.busy, flow.claimResult, flow.error, flow.fullyFunded]);

  // ── Env-error guard (must run after all hooks) ────────────────────────────

  if (configError.length > 0) {
    return <EnvSetupScreen errors={configError} />;
  }

  // ── Landing screen ────────────────────────────────────────────────────────

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

  // ── Circle screen ─────────────────────────────────────────────────────────

  const step: 0 | 1 | 2 | 3 = flow.claimResult ? 3 : flow.fullyFunded ? 2 : 1;

  return (
    <div className="page">
      <NetworkBanner networkPassphrase={NETWORK.networkPassphrase} />
      <div className="card">
        {/*
          Persistent live region — always in the DOM so the browser registers
          it before any text lands inside it (a common AT pitfall).
        */}
        <LiveRegion message={liveRegionMessage} />

        <div className="row space-between">
          <h1 className="small" ref={circleHeadingRef} tabIndex={-1}>
            SHARIBO
          </h1>
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
              {t("common.startNewCircle")}
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
          <>
            <ClaimSection
              members={flow.members}
              claimantIndex={flow.claimantIndex}
              onSelectClaimant={flow.setClaimantIndex}
              busy={flow.busy}
              claimStage={flow.claimStage}
              proveElapsedSeconds={flow.proveElapsedSeconds}
              onClaim={flow.doClaim}
            />
            <ClaimExplainer />
          </>
        )}

        {flow.claimResult && (
          <ResultCard
            claimResult={flow.claimResult}
            rejection={flow.rejection}
            busy={flow.busy}
            nullifierClaimed={flow.nullifierClaimed}
            circleId={flow.circleId}
            onClaimAgain={flow.claimAgain}
            onReset={flow.resetToLanding}
          />
        )}

        {flow.error && <p className="error">{flow.error}</p>}
      </div>
    </div>
  );
}
