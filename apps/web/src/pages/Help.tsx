import type { ReactNode } from "react";
import { Link } from "react-router";
import { Code, DocPage, Path } from "../components/doc/Doc.tsx";

/** Problems people actually hit, phrased the way they'd describe them. */
export function Help() {
  return (
    <DocPage
      title="Troubleshooting"
      intro={
        <p>
          The room page shows live numbers under the video (guests) and in the Guests list (host). They usually point
          to the cause.
        </p>
      }
    >
      <Problem id="no-picture" title="A guest never gets a picture (stays on “Connecting…”)">
        <p>
          The host and guest couldn't connect directly. Some networks block this, often mobile carriers and some
          workplaces or campuses (strict NAT).
        </p>
        <ul>
          <li>Try the guest on another network (home Wi-Fi instead of mobile data, or the other way round).</li>
          <li>
            The site's owner can add a relay (TURN). With a relay, the guest's <Path>Route</Path> shows{" "}
            <strong>Relayed (TURN)</strong> and the picture works on almost any network.
          </li>
          <li>
            The host can try <Path>Test pattern</Path> first: if even that doesn't arrive, it's the network, not PCSX2.
          </li>
        </ul>
      </Problem>

      <Problem id="lag" title="Lag, stutter or low frame rate">
        <ul>
          <li>
            Host's Guests list says <strong>limited by bandwidth</strong>: the host's upload is too slow. Lower the
            quality (540p or 480p), or have fewer guests. Each guest needs its own copy of the stream.
          </li>
          <li>
            Says <strong>limited by cpu</strong>: the host PC can't encode fast enough. Lower the quality, close other
            programs, or lower PCSX2's internal resolution.
          </li>
          <li>
            High <Path>Round trip</Path> (over ~120 ms): the networks are far apart. Nothing in the settings fixes
            distance.
          </li>
          <li>
            The game itself slows down: <Path>Settings → Emulation → System Settings → EE Cycle Rate → 130%
            (Overclock)</Path>, and use the{" "}
            <Link to="/host#latency" className="font-semibold text-accent-text underline underline-offset-4">
              recommended settings
            </Link>
            .
          </li>
        </ul>
      </Problem>

      <Problem id="black" title="Black or frozen picture">
        <ul>
          <li>PCSX2 is minimised. Restore it; covering it with other windows is fine.</li>
          <li>
            PCSX2 is in exclusive fullscreen. Play windowed (with <Path>Render To Separate Window</Path> on) and share
            that window.
          </li>
          <li>The wrong window was shared. Stop streaming, start again, and pick the PCSX2 game window.</li>
          <li>
            Still black on the guest while the host's preview is fine: the guest's browser is blocking autoplay or the
            connection dropped; reload the guest's page.
          </li>
        </ul>
      </Problem>

      <Problem id="controller" title="A guest's controller doesn't move their character">
        <p>Work through the chain from the guest to the game:</p>
        <ol>
          <li>
            Guest: <Path>Test controller</Path> shows the presses? If not, press a button to wake the controller, try
            another USB port, or use the keyboard keys listed there.
          </li>
          <li>
            Guest's <Path>Controller</Path> line says “you control P2 in the game”? If it says “take a player slot”,
            pick one. If it says the host's bridge isn't connected, it's step 3.
          </li>
          <li>
            Host: <Path>Controller bridge</Path> says <strong>Connected</strong>? If “Agent not found”, start the agent;
            if “Wrong token”, paste the token from the agent's window again.
          </li>
          <li>
            Host: the bridge lists a virtual controller for that player? If not, restart the agent with{" "}
            <Code>--pads 1,2,3,4</Code>, or move the guest to another slot.
          </li>
          <li>
            PCSX2: <Path>Settings → Controllers</Path>, multitap on, and each <Path>Controller Port 1B–1D</Path> mapped to
            a virtual controller in order. <Path>Tools → Controller Tester</Path> can help check.
          </li>
          <li>The wrong player moves: the virtual controllers are mapped in the wrong order in PCSX2. Swap them.</li>
        </ol>
      </Problem>

      <Problem id="agent" title="The host page can't find the agent">
        <ul>
          <li>The agent window must stay open while you play.</li>
          <li>
            Chrome may ask to let the site access devices on your local network: choose <strong>Allow</strong>. If you
            blocked it, allow it again from the padlock icon next to the address.
          </li>
          <li>
            Download the agent from this site's host guide. Copies built for other addresses only accept the site they
            were built for.
          </li>
          <li>Only one tab can be connected to the agent. Close other room tabs.</li>
        </ul>
      </Problem>

      <Problem id="windows" title="Windows or antivirus blocks the agent">
        <p>
          The agent isn't code-signed. See{" "}
          <Link to="/host#smartscreen" className="font-semibold text-accent-text underline underline-offset-4">
            “Windows protected your PC”
          </Link>{" "}
          in the host guide, and check the download's SHA-256 there.
        </p>
      </Problem>

      <Problem id="no-sound" title="Guests have no sound">
        <p>
          Browsers can't capture sound from a single window on Windows. Choose <Path>Entire screen with sound</Path>{" "}
          instead (guests then see the whole screen). On the guest, press <Path>Unmute</Path> if it's shown.
        </p>
      </Problem>
    </DocPage>
  );
}

function Problem({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 border-t border-border pt-6 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-6 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-6 [&_li]:marker:text-muted"
    >
      <h2 id={id} className="font-display text-2xl font-bold uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
