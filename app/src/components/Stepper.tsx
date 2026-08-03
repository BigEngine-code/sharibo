export function Stepper({ step }: { step: 0 | 1 | 2 | 3 }) {
  const labels = ["Create", "Fund", "Prove & Claim", "Unlinked ✓"];
  return (
    <div className="stepper">
      {labels.map((label, i) => (
        <div key={label} className={`step ${i < step ? "done" : i === step ? "active" : ""}`}>
          <span className="step-dot">{i < step ? "✓" : i + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}
