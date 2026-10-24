import { Link } from "react-router";
import { AgentDownload } from "../components/doc/AgentDownload.tsx";
import { Callout, Code, DocPage, Ext, Path, Step, Steps } from "../components/doc/Doc.tsx";
import { LINKS } from "../site.ts";

/** Menu names are taken from PCSX2 2.8.2's source code. */
export function HostGuide() {
  return (
    <DocPage
      title="Host setup"
      intro={
        <p>
          The host runs Urban Reign in PCSX2 on a Windows PC and streams it. Guests only need a browser. Set this up
          once; after that, hosting takes a minute.
        </p>
      }
    >
      <Callout kind="legal" title="Bring your own copy">
        <p>
          ReignRoom never provides, links to or helps you obtain the Urban Reign disc image or a PS2 BIOS. Use{" "}
          <strong>only copies you dumped yourself</strong> from your own disc and your own console. PCSX2's guides show
          how: <Ext href={LINKS.pcsx2BiosGuide}>dumping your BIOS</Ext> and{" "}
          <Ext href={LINKS.pcsx2DumpingGuide}>dumping your discs</Ext>.
        </p>
      </Callout>

      <section aria-labelledby="needs" className="flex flex-col gap-3">
        <h2 id="needs" className="font-display text-2xl font-bold uppercase">
          What you need
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-6 marker:text-muted">
          <li>Windows 10 or 11 (64-bit), and Chrome or Edge.</li>
          <li>Your own Urban Reign disc image and your own PS2 BIOS dump.</li>
          <li>A controller for yourself (you play P1 on it, directly in PCSX2).</li>
          <li>
            Upload speed of about 4 Mbps per guest at 540p (6 Mbps at 720p). Each guest gets their own copy of the
            stream.
          </li>
        </ul>
      </section>

      <Step n={1} id="pcsx2" title="Install PCSX2 and load the game">
        <Steps>
          <li>
            Install the latest PCSX2 from <Ext href={LINKS.pcsx2Download}>pcsx2.net</Ext>.
          </li>
          <li>
            On first start, point it at the folder with your BIOS dump (later: <Path>Settings → BIOS</Path>).
          </li>
          <li>
            Start the game with <Path>File → Start File…</Path> and choose your Urban Reign image (ISO or CHD).
          </li>
        </Steps>
      </Step>

      <Step n={2} id="controllers" title="Four players: multitap and controllers">
        <p>Do this after step 4 (the agent), so its virtual controllers are listed.</p>
        <Steps>
          <li>
            <Path>Settings → Controllers → Global Settings</Path>: under <Path>Controller Multitap</Path>, tick{" "}
            <Path>Multitap on Console Port 1</Path>. Leave <Path>Enable SDL Input Source</Path> on.
          </li>
          <li>
            The list on the left now shows <Path>Controller Port 1A</Path> to <Path>1D</Path>. Select each one and press{" "}
            <Path>Automatic Mapping</Path>:
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-6 marker:text-muted">
              <li>
                <strong>1A</strong>: your own controller (P1).
              </li>
              <li>
                <strong>1B, 1C, 1D</strong>: the first, second and third virtual Xbox 360 controller. The agent creates
                them in player order (P2, P3, P4), so they appear in that order after your own controller.
              </li>
            </ul>
          </li>
          <li>
            If player 2 doesn't respond in a two-player match, also map the first virtual controller to{" "}
            <Path>Controller Port 2</Path>. (Which port Urban Reign reads in each mode is still being confirmed.)
          </li>
        </Steps>
        <p className="text-sm text-muted">
          PCSX2's own <Ext href={LINKS.pcsx2Controllers}>controller guide</Ext> explains mapping in more detail.
        </p>
      </Step>

      <Step n={3} id="pine" title="Let ReignRoom see the game (PINE)">
        <p>
          PINE lets the agent ask PCSX2 which disc is running, so the host page can confirm it's Urban Reign. The agent
          only reads the game's serial, title and status.
        </p>
        <Steps>
          <li>
            <Path>Tools → Show Advanced Settings</Path> (the Advanced page is hidden until you do). PCSX2 warns about
            changing advanced settings; choose <Path>Yes</Path>.
          </li>
          <li>
            <Path>Settings → Advanced → PINE Settings</Path>: tick <Path>Enable</Path>. Leave the slot at{" "}
            <Code>28011</Code>.
          </li>
          <li>Restart PCSX2.</li>
        </Steps>
      </Step>

      <Step n={4} id="agent" title="Install the controller driver and the agent">
        <p>
          The agent is a small program that turns your guests' controllers into virtual controllers for PCSX2. It only
          talks to this site, on your PC.
        </p>
        <Steps>
          <li>
            Install the <strong>ViGEmBus 1.22.0</strong> driver: <Ext href={LINKS.vigembus}>ViGEmBus releases</Ext>, file{" "}
            <Code>ViGEmBus_1.22.0_x64_x86_arm64.exe</Code>. If an older version is installed, uninstall{" "}
            <Path>Nefarius Virtual Gamepad Emulation Bus Driver</Path> under{" "}
            <Path>Settings → Apps → Installed apps</Path> first.
          </li>
          <li>Download the agent, check its fingerprint, and unzip it:</li>
        </Steps>
        <AgentDownload />
        <Steps>
          <li value={3}>
            Run <Code>reignroom-agent.exe</Code> from the unzipped folder (keep the folder together).
          </li>
        </Steps>

        <section aria-labelledby="smartscreen" className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface px-4 py-4">
          <h3 id="smartscreen" className="font-semibold">
            If Windows says “Windows protected your PC”
          </h3>
          <p className="text-sm">
            The agent isn't code-signed (signing costs money every year), so Windows SmartScreen doesn't know it yet.
            What you'll see:
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-sm marker:text-muted">
            <li>
              A blue window titled <strong>Windows protected your PC</strong> saying Microsoft Defender SmartScreen
              prevented an unrecognised app from starting. There's only a <strong>Don't run</strong> button.
            </li>
            <li>
              Click the small <strong>More info</strong> link under the text. Two lines appear: <strong>App:</strong>{" "}
              <Code>reignroom-agent.exe</Code> and <strong>Publisher:</strong> Unknown publisher.
            </li>
            <li>
              Check the app name is exactly <Code>reignroom-agent.exe</Code> and that the zip's SHA-256 matched above. Then
              click <strong>Run anyway</strong>.
            </li>
          </ol>
          <p className="text-sm text-muted">
            Some antivirus tools also flag unsigned programs built with PyInstaller. The agent is built from the
            project's public source in GitHub Actions; the release page links the exact build. If your antivirus
            quarantines it, check the hash, then restore it or report it to your antivirus vendor as a false positive.
          </p>
        </section>

        <Steps>
          <li value={4}>
            The agent window shows a <strong>pairing token</strong>. When you host a room, paste it into{" "}
            <Path>Controller bridge</Path> on the room page. It's remembered, so you only do this once per browser.
          </li>
          <li value={5}>
            If Chrome asks to let this site access devices on your local network, choose <strong>Allow</strong>: that's
            how the page reaches the agent on your own PC.
          </li>
        </Steps>
      </Step>

      <Step n={5} id="latency" title="Recommended PCSX2 settings for streaming">
        <ul className="flex list-disc flex-col gap-1.5 pl-6 marker:text-muted">
          <li>
            <Path>Settings → Emulation → Frame Pacing / Latency Control</Path>: turn <Path>Optimal Frame Pacing</Path>{" "}
            on (PCSX2: every frame is presented before input is read). Leave <Path>Vertical Sync (VSync)</Path> and{" "}
            <Path>Use Host VSync Timing</Path> off (PCSX2 warns the latter adds input latency).
          </li>
          <li>
            <Path>Settings → Interface → Game Display</Path>: turn on <Path>Render To Separate Window</Path>, so the
            window you share shows only the game.
          </li>
          <li>Play in a window, not fullscreen, and don't minimise it: a minimised window sends no picture.</li>
          <li>
            <Path>Internal Resolution</Path> (in <Path>Settings → Graphics</Path>): Native is plenty for 480p/540p
            streams; 2x suits 720p. (Our suggestion, not a PCSX2 recommendation.)
          </li>
        </ul>
        <p>
          <strong>If the game runs slowly:</strong> <Path>Settings → Emulation → System Settings → EE Cycle Rate</Path> →{" "}
          <Path>130% (Overclock)</Path>, as PCSX2's game database notes for Urban Reign, or update PCSX2. See also the{" "}
          <Ext href={LINKS.pcsx2WikiUrbanReign}>PCSX2 wiki page for Urban Reign</Ext>.
        </p>
      </Step>

      <Step n={6} id="host" title="Host a game">
        <Steps>
          <li>
            Start the agent and PCSX2, and boot Urban Reign. On the <Link to="/" className="font-semibold text-accent-text underline underline-offset-4">home page</Link>, create a room for 2, 3 or 4 players.
          </li>
          <li>
            Check <Path>Controller bridge</Path> says <strong>Connected</strong> and <strong>Urban Reign detected</strong>.
          </li>
          <li>
            Under <Path>Stream</Path>, choose <Path>Game window</Path> (or <Path>Entire screen with sound</Path> for game
            audio), press <Path>Start streaming</Path> and pick the PCSX2 window.
          </li>
          <li>Send guests the invite link. They pick a player slot and test their controller before the match.</li>
        </Steps>
        <p className="text-sm text-muted">
          Something not working? See <Link to="/help" className="font-semibold text-accent-text underline underline-offset-4">Troubleshooting</Link>.
        </p>
      </Step>
    </DocPage>
  );
}
