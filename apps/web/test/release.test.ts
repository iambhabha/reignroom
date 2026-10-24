import { describe, expect, it } from "vitest";
import { pickAgentRelease } from "../src/components/doc/AgentDownload.tsx";

const asset = (name: string, digest?: string) => ({
  name,
  size: 9_856_000,
  browser_download_url: `https://github.com/o/r/releases/download/x/${name}`,
  ...(digest ? { digest } : {}),
});

describe("pickAgentRelease (GitHub releases API shape)", () => {
  it("picks the newest published agent release and GitHub's SHA-256 of the zip", () => {
    const r = pickAgentRelease([
      { tag_name: "agent-v0.2.0", draft: true, prerelease: false, html_url: "u0", assets: [] },
      { tag_name: "site-v1", draft: false, prerelease: false, html_url: "u1", assets: [] },
      {
        tag_name: "agent-v0.1.0",
        draft: false,
        prerelease: false,
        html_url: "https://github.com/o/r/releases/tag/agent-v0.1.0",
        assets: [
          asset("SHA256SUMS.txt"),
          asset("reignroom-agent-0.1.0-windows-x64.zip", "sha256:8f24e6cc2fc882a762467de0289c2dd482ea1e339a67b499d73b0c87c36d3991"),
        ],
      },
    ]);
    expect(r).toMatchObject({
      tag: "agent-v0.1.0",
      zip: { name: "reignroom-agent-0.1.0-windows-x64.zip", sha256: "8f24e6cc2fc882a762467de0289c2dd482ea1e339a67b499d73b0c87c36d3991" },
    });
  });

  it("copes with no digest, no zip, or no agent release", () => {
    expect(pickAgentRelease([{ tag_name: "agent-v1", html_url: "u", assets: [asset("reignroom-agent-1-windows-x64.zip")] }])?.zip?.sha256).toBeNull();
    expect(pickAgentRelease([{ tag_name: "agent-v1", html_url: "u", assets: [] }])?.zip).toBeNull();
    expect(pickAgentRelease([])).toBeNull();
    expect(pickAgentRelease({ message: "rate limited" })).toBeNull();
  });
});
