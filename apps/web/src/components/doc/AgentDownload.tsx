import { useEffect, useState } from "react";
import { SITE, repoSlug } from "../../site.ts";
import { Code, Ext } from "./Doc.tsx";

interface Release {
  tag: string;
  url: string;
  zip: { name: string; url: string; sha256: string | null; mb: number } | null;
}

type Load = { state: "loading" } | { state: "ok"; release: Release } | { state: "none" } | { state: "error" };

/**
 * Latest agent release, read live from GitHub so the version and SHA-256 shown here always
 * match the file offered. The hash is GitHub's own digest of the uploaded file.
 */
export function AgentDownload() {
  const slug = repoSlug();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!slug) return;
    let live = true;
    fetch(`https://api.github.com/repos/${slug}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: unknown) => {
        if (!live) return;
        const release = pickAgentRelease(list);
        setLoad(release ? { state: "ok", release } : { state: "none" });
      })
      .catch(() => live && setLoad({ state: "error" }));
    return () => {
      live = false;
    };
  }, [slug]);

  if (!slug || !SITE.repoUrl) {
    return (
      <p className="rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm">
        The download link appears here once the site's GitHub repository is configured.
      </p>
    );
  }
  const releasesUrl = `${SITE.repoUrl}/releases`;
  if (load.state === "loading") return <p className="text-sm text-muted" role="status">Checking the latest release…</p>;
  if (load.state !== "ok" || !load.release.zip) {
    return (
      <p className="text-sm">
        {load.state === "none" ? "No agent release has been published yet. " : "Couldn't load release details. "}
        See <Ext href={releasesUrl}>the project's GitHub Releases</Ext>.
      </p>
    );
  }
  const { release } = load;
  const zip = release.zip!;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface px-4 py-4">
      <a
        href={zip.url}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover"
      >
        Download {zip.name} ({zip.mb.toFixed(1)} MB)
      </a>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Release</dt>
        <dd>
          <Ext href={release.url}>{release.tag}</Ext> (release notes link the build log)
        </dd>
        <dt className="text-muted">SHA-256</dt>
        <dd className="font-mono text-xs break-all">{zip.sha256 ?? "not reported by GitHub"}</dd>
      </dl>
      <p className="text-sm text-muted">
        To check the download, run this in PowerShell in your Downloads folder and compare the result with the SHA-256
        above (letter case doesn't matter):
      </p>
      <Code>{`Get-FileHash .\\${zip.name} -Algorithm SHA256`}</Code>
    </div>
  );
}

export function pickAgentRelease(list: unknown): Release | null {
  if (!Array.isArray(list)) return null;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const rel = r as Record<string, unknown>;
    if (typeof rel.tag_name !== "string" || !rel.tag_name.startsWith("agent-v") || rel.draft || rel.prerelease) continue;
    const assets = Array.isArray(rel.assets) ? (rel.assets as Record<string, unknown>[]) : [];
    const a = assets.find((x) => typeof x.name === "string" && /^reignroom-agent-.*-windows-x64\.zip$/.test(x.name));
    const digest = typeof a?.digest === "string" && a.digest.startsWith("sha256:") ? a.digest.slice(7) : null;
    return {
      tag: rel.tag_name,
      url: String(rel.html_url),
      zip: a
        ? {
            name: String(a.name),
            url: String(a.browser_download_url),
            sha256: digest,
            mb: Number(a.size) / 1024 / 1024,
          }
        : null,
    };
  }
  return null;
}
