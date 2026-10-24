import { DocPage, Section } from "../components/doc/Doc.tsx";
import { SITE } from "../site.ts";

export function Contact() {
  const email = SITE.contactEmail;
  return (
    <DocPage
      title="DMCA and contact"
      intro={<p>ReignRoom hosts no game files, BIOS files or official artwork.</p>}
    >
      <Section id="contact-address" title="Contact">
        {email ? (
          <p>
            Email{" "}
            <a href={`mailto:${email}`} className="font-semibold text-accent-text underline underline-offset-4">
              {email}
            </a>
            .
          </p>
        ) : (
          <p className="rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm">
            The contact address appears here once the site owner has configured it.
          </p>
        )}
      </Section>

      <Section id="dmca" title="Copyright notices (DMCA)">
        <p>
          If you believe something on this site infringes your copyright, send a notice to the address above with:
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-6 marker:text-muted">
          <li>Your name, address, phone number and email.</li>
          <li>The copyrighted work you believe is infringed.</li>
          <li>Exactly where it appears on this site (page address, room code, or text).</li>
          <li>A statement that you believe in good faith the use isn't authorised by you, your agent, or the law.</li>
          <li>
            A statement, under penalty of perjury, that the notice is accurate and that you are the owner or authorised
            to act for them.
          </li>
          <li>Your physical or electronic signature.</li>
        </ol>
        <p>
          The site itself stores only room names, chat and player slots temporarily; streams go directly between players'
          computers and aren't stored. Valid notices are acted on promptly by removing the material or the room.
        </p>
      </Section>
    </DocPage>
  );
}
