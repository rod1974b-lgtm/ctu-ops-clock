import { describe, expect, it } from "vitest";
import { CTUAudio } from "@/lib/ctu-audio";

describe("CTU audio route compatibility", () => {
  it("provides callable credits audio controls used by the route", () => {
    expect(typeof CTUAudio.startCreditsAudio).toBe("function");
    expect(typeof CTUAudio.stopCreditsAudio).toBe("function");
  });
});