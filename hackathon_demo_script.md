# Sharibo — 60-second demo script

**Runtime target: 55–58s.** Tone: fast, confident, a little cocky — you built real cryptography that verifies on a real chain in under a minute, act like it. Every technical claim below is something this project actually proved on testnet (see `NOTES.md`) — don't soften it, it's already true.

Two ways to use this file:
1. **Shot-by-shot table below** — record screen + voice together, matched to timestamps.
2. **Clean VO-only script at the bottom** — record narration alone first, then cut picture to match. Recommended if you're not confident hitting exact timing live.

---

## Shot-by-shot (motion + voiceover)

| Time | On screen (motion) | Voiceover |
|---|---|---|
| **0:00–0:04** | Landing screen. The name-wall chips (ajo, tanda, susu, tontine…) are visible, mouse doesn't move yet — let it breathe for one beat. | *"Every culture on Earth runs a version of this."* |
| **0:04–0:09** | Quick zoom/pan across the name-wall chips left-to-right. | *"Ajo. Tanda. Susu. Tontine. Hundreds of millions of people trust a savings circle with their money — and every single one of them runs on the same weak point:"* |
| **0:09–0:13** | Cut to a plain text card (or just say it over the app, no need for a special slide if you're short on time): **"Everyone in the group knows who collects the pot."** | *"Everyone in the group knows exactly who's collecting the pot."* |
| **0:13–0:15** | Hard cut back to Sharibo landing. Click **"Launch a 5-member circle on testnet."** | *"Sharibo fixes that — on-chain."* |
| **0:15–0:22** | Sped-up montage: circle created → 5 fund buttons clicked in quick succession → pot bar fills → ring nodes light up one by one. (Speed this up 2–3× in the edit; it's several real testnet transactions.) | *"Five members. Five real deposits on Stellar testnet. Every one of them visible, on-chain, right now."* |
| **0:22–0:26** | Select a claimant, click **"Generate proof & claim."** Let the `Groth16 · BLS12-381 · 1,452 constraints` line sit on screen for a full second — don't rush past it. | *"Now — who gets the pot? Watch this."* |
| **0:26–0:34** | Proving state plays out in real time (don't speed this part up — the wait itself is the proof it's not faked). Then: claim success, ring reveal, the outside "?" node appears. | *"That's not a spinner. That's a real zero-knowledge proof — generating live, in the browser — verified on-chain with real elliptic-curve pairing math on Soroban. No server. No trusted party. Just math."* |
| **0:34–0:38** | Cut to the ring caption / explorer view: 5 deposits, 1 payout, no shared address. | *"Five deposits. One payout. Zero link between them. Nobody — not even me — can tell you which of these five members just got paid."* |
| **0:38–0:44** | Click **"Try to claim again with the same proof."** Let the red rejection box appear on screen, full-bleed if possible. | *"Now watch someone try to cheat — replaying that exact same proof."* |
| **0:44–0:47** | Hold on the red **"Rejected on-chain: AlreadyClaimed"** box. | *"Rejected. On-chain. Every time. That's not a UI check — the contract itself refused it."* |
| **0:47–0:53** | Cut back to name-wall / logo card. | *"Ajo, tanda, susu, tontine — real money, real trust, for real people. Sharibo makes that trust cryptographic instead of social."* |
| **0:53–0:57** | Final card: **SHARIBO** wordmark + one line: *"Real ZK. Real chain. Real privacy."* + repo URL. | *"This is Sharibo — real ZK, on a real chain, for a problem that's already real."* |

---

## Clean voiceover-only script

*(Read this straight through once for pacing — it should land close to 55 seconds at a natural, confident pace. Trim the bracketed optional lines first if you're running long.)*

> Every culture on Earth runs a version of this. Ajo. Tanda. Susu. Tontine. Hundreds of millions of people trust a savings circle with their money — and every single one of them runs on the same weak point: everyone in the group knows exactly who's collecting the pot.
>
> Sharibo fixes that — on-chain.
>
> Five members. Five real deposits on Stellar testnet. Every one of them visible, on-chain, right now.
>
> Now — who gets the pot? Watch this.
>
> That's not a spinner. That's a real zero-knowledge proof — generating live, in the browser — verified on-chain with real elliptic-curve pairing math on Soroban. No server. No trusted party. Just math.
>
> Five deposits. One payout. Zero link between them. Nobody — not even me — can tell you which of these five members just got paid.
>
> Now watch someone try to cheat — replaying that exact same proof.
>
> Rejected. On-chain. Every time. That's not a UI check — the contract itself refused it.
>
> Ajo, tanda, susu, tontine — real money, real trust, for real people. Sharibo makes that trust cryptographic instead of social.
>
> This is Sharibo. Real ZK, on a real chain, for a problem that's already real.

---

## On-screen text overlays (optional, if you have 10 more minutes to edit)

Drop these in as lower-thirds/captions at the matching timestamp — they let you cram in credibility facts without spending spoken seconds on them:

- **0:22** — `Groth16 · BLS12-381 · 1,452 constraints`
- **0:34** — `5 deposits in → 1 payout out → 0 visible link`
- **0:44** — `Error(Contract, #4): AlreadyClaimed`
- **0:53** — `github.com/<your-repo>` (fill in once you've decided whether/where to push)

## Recording checklist

- [ ] Do one full **dry run in the actual browser first** — this session never got to click-test the UI (see `NOTES.md`), so you're the first real QA pass. Confirm the ring/stepper render correctly before you're on camera.
- [ ] Pre-warm testnet: run through create → fund → claim → claim-again *once* off-camera so friendbot/RPC calls are already fast (repeat calls are usually snappier than the very first cold one).
- [ ] Record at a resolution where the `techline` (constraint count) and the red rejection box are actually legible — zoom in on those two moments in the edit if needed.
- [ ] Don't speed up the proving spinner — the real wait is part of the proof this isn't faked. Speed up the funding montage instead.
- [ ] If you're short on time in the edit, cut from the middle (funding montage), never from the two "wow" moments: the proof generating and the on-chain rejection.
