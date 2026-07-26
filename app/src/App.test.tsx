import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Stepper, MemberRing } from "./App";
import { Keypair } from "@stellar/stellar-sdk";

describe("Stepper", () => {
  it("renders 4 steps and marks them correctly for step 0", () => {
    const { container } = render(<Stepper step={0} />);
    const steps = container.querySelectorAll(".step");
    expect(steps).toHaveLength(4);
    
    expect(steps[0]).toHaveClass("active");
    expect(steps[0]).not.toHaveClass("done");
    expect(steps[1]).not.toHaveClass("active");
    expect(steps[1]).not.toHaveClass("done");
  });

  it("marks steps correctly for step 2", () => {
    const { container } = render(<Stepper step={2} />);
    const steps = container.querySelectorAll(".step");
    
    expect(steps[0]).toHaveClass("done");
    expect(steps[1]).toHaveClass("done");
    expect(steps[2]).toHaveClass("active");
    expect(steps[2]).not.toHaveClass("done");
    expect(steps[3]).not.toHaveClass("active");
    expect(steps[3]).not.toHaveClass("done");
  });

  it("marks steps correctly for step 3", () => {
    const { container } = render(<Stepper step={3} />);
    const steps = container.querySelectorAll(".step");
    
    expect(steps[0]).toHaveClass("done");
    expect(steps[1]).toHaveClass("done");
    expect(steps[2]).toHaveClass("done");
    expect(steps[3]).toHaveClass("active");
  });
});

describe("MemberRing", () => {
  const dummyIdentity = {
    identitySecret: 1n,
    identityNullifier: 1n,
    commitment: 1n,
  };
  const dummyKeypair = { publicKey: () => "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" } as unknown as Keypair;

  it("renders nodes and handles funded state", () => {
    const members = [
      { keypair: dummyKeypair, identity: dummyIdentity, funded: true },
      { keypair: dummyKeypair, identity: dummyIdentity, funded: false },
      { keypair: dummyKeypair, identity: dummyIdentity, funded: true },
    ];
    
    const { container } = render(<MemberRing members={members} revealed={false} />);
    // +1 for the center "pot" element which is NOT a .ring-node
    const nodes = container.querySelectorAll(".ring-node");
    expect(nodes).toHaveLength(3);
    
    expect(nodes[0]).toHaveClass("funded");
    expect(nodes[1]).not.toHaveClass("funded");
    expect(nodes[2]).toHaveClass("funded");
    
    // Recipient node should not be visible when revealed is false
    expect(container.querySelector(".ring-recipient")).not.toBeInTheDocument();
  });

  it("shows recipient node and caption when revealed", () => {
    const members = [
      { keypair: dummyKeypair, identity: dummyIdentity, funded: true },
      { keypair: dummyKeypair, identity: dummyIdentity, funded: true },
    ];
    
    const { container } = render(<MemberRing members={members} revealed={true} />);
    
    // Should have normal nodes + recipient node
    const nodes = container.querySelectorAll(".ring-node");
    expect(nodes).toHaveLength(3); // 2 members + 1 recipient
    
    const recipient = container.querySelector(".ring-recipient");
    expect(recipient).toBeInTheDocument();
    
    const caption = container.querySelector(".ring-caption");
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveTextContent(/Payout landed on the address above/i);
    expect(caption).toHaveTextContent(/cryptographically, it could be tied to any of the 2 members in the ring/i);
  });
});
