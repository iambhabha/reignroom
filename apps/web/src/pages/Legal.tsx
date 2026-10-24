import { Link } from "react-router";
import { Callout, DocPage, Section } from "../components/doc/Doc.tsx";

export function Legal() {
  return (
    <DocPage title="Legal and privacy">
      <Callout kind="legal" title="Bring your own copy">
        <p>
          ReignRoom does not host, link to, or help anyone obtain the Urban Reign disc image or a PlayStation 2 BIOS.
          Every host must use copies they dumped themselves from a disc and a console they own. ReignRoom only streams
          what the host's own PC is already running.
        </p>
      </Callout>

      <Section id="fan" title="Fan project">
        <p>
          ReignRoom is an unofficial fan project. It is not affiliated with, endorsed by, or sponsored by Bandai Namco
          Entertainment, Sony Interactive Entertainment, or the PCSX2 project. “Urban Reign” is a trademark of its
          owner and “PlayStation” is a trademark of Sony Interactive Entertainment; they're mentioned only to say which
          game this site is for. ReignRoom uses no official logos, box art, screenshots or character art.
        </p>
      </Section>

      <Section id="privacy" title="What ReignRoom stores">
        <ul className="flex list-disc flex-col gap-1.5 pl-6 marker:text-muted">
          <li>No accounts, no sign-up, no database of users.</li>
          <li>
            <strong>While a room exists</strong>: the names people enter, player slots, ready status and the last 50 chat
            messages. Rooms are deleted 30 minutes after everyone has left.
          </li>
          <li>
            <strong>Your IP address</strong> is used by Cloudflare's rate limiter to stop abuse (for example, too many
            rooms created per minute). ReignRoom doesn't record it.
          </li>
          <li>
            <strong>Video, sound and controller input</strong> go directly between the host and each guest (WebRTC). If
            a direct connection isn't possible and the site has a relay (TURN) configured, they pass through that relay
            without being stored.
          </li>
          <li>
            <strong>In your browser</strong>: your name, host access for rooms you created, the host's agent pairing
            token, and (browser emulator only, if you choose a file) a handle to the disc image file you picked, so you
            can reopen it with one click. The file itself is never copied or uploaded. Clearing site data removes them.
          </li>
          <li>
            <strong>The host agent</strong> runs only on the host's PC, listens only to that PC, and keeps its pairing
            token in the host's own Windows profile.
          </li>
        </ul>
      </Section>

      <Section id="emulator" title="Browser emulator">
        <p>
          The optional browser emulator is{" "}
          <a href="https://github.com/jpd002/Play-" className="underline underline-offset-2">
            Play!
          </a>{" "}
          by Jean-Philip Desjardins, used under the BSD 2-Clause license (
          <a href="/emu/rr2/LICENSE.txt" className="underline underline-offset-2">
            license text
          </a>
          ), with ReignRoom's controller changes. It runs in the host's own browser on the host's own disc image.
        </p>
      </Section>

      <Section id="services" title="Services used">
        <p>
          Cloudflare (website, rooms, connection helpers and optional relay) and GitHub (agent downloads; the host guide
          reads release details from GitHub's public API). Their own privacy policies apply to what they process.
        </p>
      </Section>

      <Section id="warranty" title="No warranty">
        <p>
          ReignRoom is provided as is, free, without any warranty. Use the host agent and virtual controller driver at
          your own discretion.
        </p>
      </Section>

      <p>
        Copyright concerns: see{" "}
        <Link to="/contact" className="font-semibold text-accent-text underline underline-offset-4">
          DMCA and contact
        </Link>
        .
      </p>
    </DocPage>
  );
}
