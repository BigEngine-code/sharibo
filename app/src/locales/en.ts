const en = {
  "lang.label": "Language",
  "lang.en": "English",
  "lang.es": "Spanish",
  "step.create": "Create",
  "step.fund": "Fund",
  "step.proveClaim": "Prove & Claim",
  "step.unlinked": "Unlinked ✓",
  "env.setupRequired": "Setup required",
  "env.setupIntro": "The app cannot start because one or more environment variables are missing or invalid.",
  "env.setupHowTo": "Copy app/.env.example to app/.env and fill in the values below, then restart the dev server.",
  "env.setupDetails": "See app/.env.example for the full list of required variables and their expected format.",
  "landing.tagline": "A private rotating savings circle on Stellar, with real zero-knowledge proofs.",
  "landing.sub.before": "Every round, everyone contributes. Every round, one member takes the pot. Sharibo proves",
  "landing.sub.em1": "who's entitled to claim",
  "landing.sub.middle": "without ever revealing",
  "landing.sub.em2": "who",
  "landing.sub.after": "claimed.",
  "landing.launch": "Launch a 5-member circle on testnet",
  "landing.previousCirclePrefix": "Your previous circle lives on at",
  "landing.previousCircleLink": "circle #{id} ↗",
  "landing.testnetFineprint": "Testnet only. Demo identities are generated fresh in your browser, never reused.",
  "circle.onChainLink": "circle #{id} on-chain ↗",
  "common.startNewCircle": "Start a new circle",
  "wallet.networkMismatch": "Network mismatch: Your Freighter wallet is on {walletNetwork} but this app expects {appNetwork}. Please open Freighter, click the network selector in the upper right, and switch to {appNetwork}.",
  "wallet.unknownNetwork": "Unknown network configuration. Please verify your Freighter settings."
} as const;

export default en;
