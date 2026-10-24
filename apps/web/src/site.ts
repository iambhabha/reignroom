/**
 * Deployment-specific values, set at build time in apps/web/.env.production
 * (see docs/deploy.md). Pages that need them say so when they're missing.
 */
const env = import.meta.env;

function clean(value: string | undefined, pattern: RegExp): string | null {
  const v = value?.trim();
  return v && pattern.test(v) ? v : null;
}

export const SITE = {
  /** e.g. https://github.com/<owner>/reignroom — agent downloads and release hashes. */
  repoUrl: clean(env.VITE_REPO_URL, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
  /** Address for copyright (DMCA) notices and other contact. */
  contactEmail: clean(env.VITE_CONTACT_EMAIL, /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
};

/** owner/repo for the GitHub API, from the repo URL. */
export function repoSlug(): string | null {
  return SITE.repoUrl ? SITE.repoUrl.replace("https://github.com/", "") : null;
}

export const LINKS = {
  pcsx2Download: "https://pcsx2.net/downloads",
  pcsx2BiosGuide: "https://pcsx2.net/docs/setup/bios",
  pcsx2DumpingGuide: "https://pcsx2.net/docs/setup/dumping",
  pcsx2Controllers: "https://pcsx2.net/docs/configuration/controllers",
  pcsx2WikiUrbanReign: "https://wiki.pcsx2.net/Urban_Reign",
  vigembus: "https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0",
} as const;
