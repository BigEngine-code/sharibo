import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegion, usePoliteLiveRegion } from "./usePoliteLiveRegion";

function Harness() {
  const { announce, message } = usePoliteLiveRegion(50);

  return (
    <div>
      <button onClick={() => announce("Success: price update complete.")}>announce success</button>
      <button onClick={() => announce("Error: price update failed.")}>announce failure</button>
      <LiveRegion message={message} />
    </div>
  );
}

describe("usePoliteLiveRegion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("announces a success message after the debounce window", () => {
    render(<Harness />);

    act(() => {
      screen.getByRole("button", { name: /announce success/i }).click();
    });

    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toBe("");

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(liveRegion.textContent).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(liveRegion.textContent).toBe("Success: price update complete.");
  });

  it("debounces rapid updates and announces the latest message", () => {
    render(<Harness />);

    act(() => {
      screen.getByRole("button", { name: /announce success/i }).click();
      screen.getByRole("button", { name: /announce failure/i }).click();
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole("status").textContent).toBe("Error: price update failed.");
  });

  it("announces a failure message", () => {
    render(<Harness />);

    act(() => {
      screen.getByRole("button", { name: /announce failure/i }).click();
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole("status").textContent).toBe("Error: price update failed.");
  });
});
