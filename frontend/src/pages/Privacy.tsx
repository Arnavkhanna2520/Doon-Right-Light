import { PageHeader } from "../components/ui";
import { usePageMeta } from "../lib/hooks";

export default function Privacy() {
  usePageMeta("Privacy policy", "What Doon Right-Light collects when you submit a lighting report, why, and how it is protected.");
  const S = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="space-y-2"><h2 className="text-xl font-semibold">{title}</h2><div className="space-y-2 text-sm leading-relaxed">{children}</div></section>;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Privacy policy" lead="This policy explains what information the platform handles, why, and the choices you have. It describes how the software works; the team operating a deployment is responsible for following it." />
      <S title="Browsing the site">
        <p>You can use the map, dashboard and analysis, and report an issue, without an account. The site sets no advertising or analytics cookies and loads no third-party trackers. Your theme choice is stored in your browser only.</p>
        <p>Map tiles are fetched from OpenStreetMap's servers, which therefore see your IP address and the area you view, as with any web map.</p>
      </S>
      <S title="When you submit a report">
        <p><strong>What we collect:</strong> the issue category, your description, the location text and optional map pin, an optional photograph, and optional contact details.</p>
        <p><strong>Why:</strong> to find the light you are describing, check it, and pass verified problems to the people who can fix them.</p>
        <p><strong>Contact details are optional</strong> and stored only if you tick the consent box. They are visible to project moderators only, are never shown publicly, and are excluded from every data export.</p>
        <p><strong>Photographs</strong> are re-encoded on upload, which removes embedded metadata such as GPS position and device details. They are visible to moderators only. Please avoid photographing people, house numbers or vehicle number plates.</p>
        <p><strong>Your IP address is not stored with your report.</strong> A salted, one-way hash of it is kept to limit spam; it cannot be turned back into an address. Rate limiting also keeps only a salted hash of your address, and deletes it within a day.</p>
      </S>
      <S title="What becomes public">
        <p>Nothing, until a moderator has reviewed your report. After review, the public map shows only the category, status, date and a position rounded to about 100 metres. Your description, photograph and contact details are never published.</p>
        <p>Anyone who has your report ID can see its category, status and any note the reviewer wrote for you, so share the ID only with people you trust.</p>
      </S>
      <S title="Staff accounts">
        <p>Staff sign in with an email address and password. Passwords are stored only as salted bcrypt hashes. Sessions use a signed, HTTP-only cookie that expires after a few hours. Sign-ins, reviews, imports, exports and configuration changes are recorded in an activity log visible to administrators.</p>
      </S>
      <S title="Retention and your choices">
        <p>Reports are kept for as long as they are useful for the audit. To have a report or your contact details removed, contact the project team through the repository linked in the footer and quote your report ID.</p>
        <p>Do not include sensitive personal information about yourself or anyone else in a description. Reports that identify or target a private individual will be rejected.</p>
      </S>
      <S title="Status of this project">
        <p>Doon Right-Light is a student-built platform. It is not an official grievance service of the Government of Uttarakhand, the Municipal Corporation of Dehradun or any electricity utility, and submitting a report here does not register a complaint with them.</p>
      </S>
    </div>
  );
}
