import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function ChangeLogContent() {
  return (
    <div className="mt-6">
      <Accordion
        type="single"
        collapsible
        defaultValue="v0.12.0"
        className="space-y-4"
      >
        {/* v0.12.0 */}
        <AccordionItem
          value="v0.12.0"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.12.0
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>November 17, 2026</strong> - Value Journey, Customer Workspace &amp; Account Portal, CRM-Linked Accounts &amp; Full Demo Mode
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Project customer users</strong> — Reading the customer users on a project now needs access to that project.</li>
                  <li>• <strong>Staff-only risk scores</strong> — Only internal staff see risk scores, and email logs need the Email Logs permission.</li>
                  <li>• <strong>Scoped profiles and requests</strong> — Infrastructure Discovery profiles are limited to the user's own accounts, and customers see only their own Evaluation Requests while staff see every request on accounts they can open.</li>
                  <li>• <strong>Account Portal</strong> — Customers no longer see the Internal Project Status.</li>
                  <li>• <strong>Dependency updates</strong> — Major upgrades to @hookform/resolvers, SimpleWebAuthn, date-fns, google-auth-library, i18next, react-i18next, openai, react-day-picker, nanoid, croner, Google Cloud Storage and vitest, plus monthly minor and patch updates (hono, fast-xml-parser and more). Unused packages were removed and Dependabot now opens one grouped update a month.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Value Journey</strong> — Five journey stages (Plan, Build, Validate, Decide, Handoff) label the MAP phases. Success criteria link to MAP tasks, the customer agrees to the criteria (name and date) before the validation starts, criteria show a must-have or nice-to-have icon, and Professional Services contacts are captured for the handoff.</li>
                  <li>• <strong>Customer workspace</strong> — The project page and Account Portal share a three-pane layout: the journey, a project brief, one team card, a roadmap, bento KPI tiles and a calendar of starts, ends, due dates and to-dos. Project messages with unread counts let staff and customers talk, and customers can mark their to-dos done.</li>
                  <li>• <strong>Account Portal</strong> — Project cards keep one height with every journey stage on one line, the roadmap shows progress and the current stage on each bar with to-do counts per lane, and messages from every project appear in one place.</li>
                  <li>• <strong>Resource Content</strong> — A new page manages the portal's Learning &amp; Documentation and Support &amp; Community links.</li>
                  <li>• <strong>CRM-linked accounts</strong> — Accounts store their CRM account ID and take name, industry, region, website and owner from the CRM. Unlinked accounts get suggested matches, Create Project picks the account from the CRM, and Account Users can be imported from the account's CRM contacts.</li>
                  <li>• <strong>Teams from SSO and the CRM</strong> — Okta and Azure groups map to teams at sign-in, and teams and subteams can link to CRM departments and sync their members daily.</li>
                  <li>• <strong>Evaluation Requests page</strong> — Projects Workspace lists every request you can see across accounts, with filters, totals and View, Edit and Delete actions. The menu name follows the Terminology setting.</li>
                  <li>• <strong>Manage Projects table</strong> — Account-first rows with icon status pills, solution marks, richer hovers and a one-click density toggle. For Review cards show a theme header, risk edge and progress ring. ImpactIQ activity counts open a drawer listing each activity with its type icon, person, hours and dates.</li>
                  <li>• <strong>Mutual Action Plan</strong> — A redesigned MAP drawer with a grouped Full plan table, days early or late, a progress bar, an icon-only toolbar and "Our team" role assignment. MAP is the one plan, with Quick plans and Add to plan.</li>
                  <li>• <strong>Reports</strong> — Reports lives under Insights with one library table, KPI cards and an expandable calendar of scheduled reports and their run history. Scheduled reports are emailed as a table with a CSV attached.</li>
                  <li>• <strong>Infrastructure Discovery on projects</strong> — Attach a discovery profile to a project.</li>
                  <li>• <strong>Demo Mode</strong> — One-click Reseed fills every page with a realistic demo story owned by Demo Staff: named projects in every status, value journeys, MAPs, ImpactIQ effort, teams, discovery profiles, assumptions, risks, workflow automation, AI assessments, templates and a Recent Activity table. Demo and real data stay apart, and the demo indicator sits at the bottom of the sidebar.</li>
                  <li>• <strong>What's new by category</strong> — The version updates list groups each change under Security, New Features, Improvements or Fixes.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Project page</strong> — The Overview folds journey details, shows compact to-dos and a criteria KPI tile, and the header shows journey stage icons, the timeline beside ACV and an icon-only TAP button. Success Criteria and Validation Criteria tables have clearer headers and component groups.</li>
                  <li>• <strong>Internal accounts</strong> — Evaluation Requests and Infrastructure Discovery are hidden on internal accounts.</li>
                  <li>• <strong>Account Access</strong> — Shows job titles, which people can set themselves when missing.</li>
                  <li>• <strong>ImpactIQ setup</strong> — The ImpactIQ integration card lists its setup steps.</li>
                  <li>• <strong>Competitor Intelligence</strong> — Starts empty on a new install.</li>
                  <li>• <strong>Create Project</strong> — Save As Template and Create Project sit at the bottom of the form, and Save As Project Template keeps every project feature in My Templates.</li>
                  <li>• <strong>Open source ready</strong> — Vendor references removed and community files added, with CI on GitHub-hosted runners.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Expired sign-in</strong> — Goes to the sign-in page instead of Setup.</li>
                  <li>• <strong>Customer access</strong> — Customers listed on a project no longer get "Access denied".</li>
                  <li>• <strong>Accounts and projects</strong> — Projects link to accounts by ID, so renaming an account keeps its projects, and Edit Project no longer clears fields.</li>
                  <li>• <strong>Evaluation Requests</strong> — View and Edit work and new requests save.</li>
                  <li>• <strong>MAP dates</strong> — Start and End are stamped, Due shows below, and saving Complete on MAP items works.</li>
                  <li>• <strong>AI Providers</strong> — The list no longer hangs loading and shows current default models.</li>
                  <li>• <strong>Readability</strong> — Manage Projects status pills and progress rings read well on light themes, the Add Link icon is white like other buttons, and the portal hides To-do and Messages pills for projects with none.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.11.0 */}
        <AccordionItem
          value="v0.11.0"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.11.0
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 30, 2026</strong> - Teams, Working-Day Scheduling, One Admin Page &amp; Backup/Restore
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Account writes locked down</strong> — Editing or archiving an account and syncing its approved domains and competitors need edit access to Account Management; before, any signed-in user could do it.</li>
                  <li>• <strong>Outcome routes protected</strong> — Outcome Intelligence reads and writes now check project access and permissions instead of sign-in only.</li>
                  <li>• <strong>Staff-only data</strong> — Running reports and loading Project Board data are now limited to internal staff, and App Health data needs its page permission. Assumptions and Dependencies use their own permission keys.</li>
                  <li>• <strong>Old Salesforce link screens removed</strong> — Unused Salesforce link pages and their open routes are gone, and leftover copies of per-user Salesforce tokens were cleared.</li>
                  <li>• <strong>Signed webhook timestamps</strong> — Webhooks carry <code>X-CriteriaIQ-Signature-V2</code>, which signs the send time with the body so a receiver can refuse replays.</li>
                  <li>• <strong>Dependency updates</strong> — nodemailer, multer, undici, zod, puppeteer, body-parser, dompurify, tinymce, i18next-http-backend, happy-dom and vitest.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Teams</strong> — Admin › Team &amp; People › Teams organizes people into teams and subteams. Projects have an owning team, Manage Projects, the board, the Dashboard and Report Builder filter by team, and teams can receive announcements, workflow emails and outcome escalations. Team Users is now Account Users.</li>
                  <li>• <strong>Working-day scheduling</strong> — Holiday calendars live under System Settings › Calendar. MAP dates, template offsets, due-soon reminders, end-date flags and deadline alerts count working days, using each person's work week, time off and holidays, plus the customer's holidays. MAP due dates can be written to Outlook as all-day events.</li>
                  <li>• <strong>Personal notifications and digest</strong> — The bell shows items "For you" for every role, including support request and evaluation request changes, and each person can get a daily email digest.</li>
                  <li>• <strong>Maintenance announcements</strong> — Communications › System Announcements schedules a maintenance window that shows a banner with a countdown.</li>
                  <li>• <strong>Backup &amp; Restore</strong> — Admins can export the whole database, preview a restore before running it, and download or restore a copy with personal data masked.</li>
                  <li>• <strong>ImpactIQ and VectorIQ links</strong> — A versioned project summary API feeds ImpactIQ, the project page shows SE effort (and cost, with the new SE Cost permission) from ImpactIQ, and VectorIQ can read a per-person summary with a <code>people:read</code> key.</li>
                  <li>• <strong>Outcome capture on close</strong> — Closing a project (by status, CRM stage or either) can ask for, or require, an outcome, with per-type rules, reminders and manager escalation.</li>
                  <li>• <strong>Page Usage</strong> — Admin › Monitoring &amp; Audit › Page Usage counts page views.</li>
                  <li>• <strong>Profile integrations</strong> — Profile Settings › Integrations shows your Salesforce or HubSpot connection and lets you sign in to Outlook yourself; Profile shows your holiday calendars.</li>
                  <li>• <strong>View As</strong> — The Dev Persona Switcher now shows pages exactly as the chosen person sees them.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>One Admin page</strong> — Admin opens as one page with ImpactIQ-style categories. Role Management follows the sidebar with one None/View/Edit value per page, Industries has its own page, Field Settings and Storage Providers use tabs, and every Admin table has sortable columns.</li>
                  <li>• <strong>Integrations Overview</strong> — The CRM card groups the Salesforce, HubSpot and Validation Record cards, and Email Configuration opens inline.</li>
                  <li>• <strong>Scheduler</strong> — Jobs are grouped by category, jobs for the CRM you didn't choose are hidden, run history is paged and can be cleared, and the Welcome email moved here from Workflow Automation.</li>
                  <li>• <strong>Manage Projects</strong> — The Dashboard's Due / For Review / Table views moved onto Manage Projects.</li>
                  <li>• <strong>Version updates</strong> — The version under the logo lists every update since the last release; the full notes are under Major Release Change Log.</li>
                  <li>• <strong>Look and feel</strong> — Page-aware Guide link, print styles, icons on status pills, the theme color on buttons, switches and selected states, and a translated Getting Started widget.</li>
                  <li>• <strong>Internal account</strong> — Staff users can be linked to the internal account (outside users never can), only an Admin can change or archive the internal account, broken logo previews show a placeholder, and the account form's Team Assignment section is now Sales Account Assignment.</li>
                  <li>• <strong>Retired</strong> — Backup Destinations, the database backup workflow action and the Data Sync page were removed; Fiscal Calendar is now Calendar.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>SSO with MFA</strong> — Users with CriteriaIQ MFA who sign in with SSO finish sign-in instead of landing on a missing page.</li>
                  <li>• <strong>Sidebar when viewing as a role</strong> — No longer blank, and User Management viewers get their own permissions.</li>
                  <li>• <strong>Account logos</strong> — Expiring cloud logo links are renewed when a project loads.</li>
                  <li>• <strong>MAP emails</strong> — Broken direct MAP notification emails that never sent were removed; MAP events now run Workflow Automation rules instead.</li>
                  <li>• <strong>Profile cards</strong> — CRM and Outlook cards always show on Profile › Integrations.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.10.0 */}
        <AccordionItem
          value="v0.10.0"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.10.0
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 26, 2026</strong> - HubSpot, CRM Choice, Scheduler &amp; Security Hardening
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>MFA required for every user</strong> — In production, a user who hasn't set up MFA can only reach MFA enrollment until they do; trusted SSO MFA counts.</li>
                  <li>• <strong>Access changes take effect at once</strong> — Each request re-checks the user's active flag, approval and role. Deactivating, archiving, changing a role or resetting a password ends the user's sessions (and revokes their API keys on deactivate or archive) and writes an audit row.</li>
                  <li>• <strong>Admin-only role writes</strong> — Creating, renaming or deleting roles and editing role permission templates required only a signed-in session; they are now Admin-only. The users-by-role list needs sign-in and view access to User Management.</li>
                  <li>• <strong>Deal and CRM fields hidden from outside users</strong> — Customer, Guest and Partner users no longer receive deal value, sales stage, forecast, CRM record ids or links, and CRM queries are refused for them.</li>
                  <li>• <strong>Project access fixes</strong> — External users with Edit access can change only Account Status; full edits, internal status, risk, ranking and archive need an internal user. Status, risk and ranking list writes need edit on Field Settings.</li>
                  <li>• <strong>Setup wizard token</strong> — While first-run setup is open, every setup route needs a setup token (<code>SETUP_TOKEN</code>, or one printed to the server log at startup).</li>
                  <li>• <strong>Safer Salesforce sign-in</strong> — The connect flow uses a one-time state value tied to the session, the Salesforce login URL must be an https Salesforce host, and per-user Salesforce tokens moved to their own encrypted <code>user_integrations</code> table.</li>
                  <li>• <strong>Dependency updates</strong> — <code>markdown-it</code> 14.3.3 and <code>vite</code> 8.3.5.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Choose one CRM per install</strong> — Admin › Integrations › Overview › CRM picks Salesforce, HubSpot or None. None is the default. Once records link to one CRM, only that CRM or None can be chosen, and None never deletes a link.</li>
                  <li>• <strong>HubSpot</strong> — Connect with a private app token (access checked before saving), search Companies and their Deals from the project form and account dialog, sync mapped fields both ways, create a Deal or Company in HubSpot on request, and run a nightly broken-link check that also follows merged records.</li>
                  <li>• <strong>Salesforce sync that runs</strong> — The sync worker starts at boot, failed syncs retry with backoff, saving a linked project or account queues a sync, scheduled sync works, a nightly check finds and heals broken links, and a Sync Issues panel lets admins retry or resolve failures.</li>
                  <li>• <strong>Configuration › Scheduler</strong> — Every background job in one place with run times, Run now, failure emails, workflow schedules and a Send Email Window.</li>
                  <li>• <strong>Terminology</strong> — Admin › System Settings › Terminology sets what the validation record is called (Evaluation, POC, POV, POx, Project or a custom name) across the app, and Integrations sets which CRM objects back it.</li>
                  <li>• <strong>New Guide</strong> — Help › Guide is a role-based start page with search, a before/during/after checklist, topic drawers and role-specific content for Customer, Partner and Guest users.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Wording follows your CRM</strong> — Screens name Salesforce or HubSpot (or "CRM" when none is chosen) instead of always saying Salesforce.</li>
                  <li>• <strong>Translations complete</strong> — Missing German, French, Spanish, Italian and Portuguese strings were filled in, and every new string must now ship in all six languages.</li>
                  <li>• <strong>Evaluation link optional without a CRM</strong> — With None, the project form no longer requires the validation record link.</li>
                  <li>• <strong>Admin menu</strong> — System Health is now Monitoring &amp; Audit, Login History moved there from User Management, Demo Mode has its own category, and Outcome Intelligence settings have their own Configuration page.</li>
                  <li>• <strong>Automatic version numbers</strong> — The version now rises after every update; this changelog is written only when a release is cut.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Workflow email digests send</strong> — Digests queried columns that don't exist, so none were ever sent and blank schedules piled up. Send Email now reaches every recipient picked in the rule editor.</li>
                  <li>• <strong>Outside users with project access</strong> — Customers, Partners and Guests with explicit access were refused on MAP reads and edits because of a data-shape mismatch.</li>
                  <li>• <strong>Guest support requests</strong> — Guests get the account picker, so their requests no longer fail.</li>
                  <li>• <strong>Sync policy conflict badge</strong> — Shows the policy's real strategy instead of always "Salesforce Wins".</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.9.0 */}
        <AccordionItem
          value="v0.9.0"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.9.0
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 20, 2026</strong> - Integrations Rebuild, n8n Automation, MCP Server &amp; Theming
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Scoped API keys</strong> — Every API key request is checked against the key's scopes (read-only, read-write or automation presets) with default deny. Key, user, role, SSO and secret endpoints are refused for every API key, admin-scoped keys can no longer be issued, and keys can carry an expiry date.</li>
                  <li>• <strong>Webhooks signed with the real secret</strong> — Outgoing webhooks were signed with the encrypted secret instead of the decrypted one; signing now uses the real secret and fails closed if it can't be decrypted.</li>
                  <li>• <strong>Success criteria writes need project edit access</strong> — Creating, editing or deleting a success criterion previously only required a signed-in session, so any user could change criteria on any project by id. Each write now checks edit access on the owning project and a criterion can't be moved to another project.</li>
                  <li>• <strong>Library and template access gaps closed</strong> — Global Validation Criteria library writes need edit permission on the matching tab or the Criteria Builder, and the edit controls are hidden without it. Project template and validation-criteria template writes are limited to internal roles.</li>
                  <li>• <strong>Per-user rate limiting</strong> — The global API rate limit is now admin-configurable and counts per signed session instead of per IP, so users behind one proxy no longer share a limit.</li>
                  <li>• <strong>Dependency update</strong> — <code>handlebars</code> 4.7.10.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Integrations Overview</strong> — Admin → Integrations opens on one card per integration showing Configured, Disabled or Not configured, with a Configure button and the Rate Limiting settings.</li>
                  <li>• <strong>Azure SSO alongside Okta</strong> — Okta and Microsoft Entra ID (Azure) are separate single sign-on providers, each configured inline from its card, with a just-in-time provisioning switch. The login page shows one Continue button per enabled provider.</li>
                  <li>• <strong>MCP server</strong> — A read-only MCP endpoint lets AI tools such as Claude Desktop, Claude Code and n8n list projects, success criteria and accounts using <code>mcp:read</code> keys. It is off by default, rate-limited per key, and logs every tool call.</li>
                  <li>• <strong>n8n event subscriptions</strong> — Webhooks can subscribe directly to project, MAP and success-criteria events without an automation rule, and the n8n trigger endpoint now runs matching automations instead of a dry run.</li>
                  <li>• <strong>Admin › Appearance</strong> — Create, copy and activate named themes (CriteriaIQ Classic or 12 presets) with light and dark values, contrast warnings and a live preview. Themes color the header, sidebar, Admin menu and primary buttons, and one Company Logo replaces the old sidebar logos.</li>
                  <li>• <strong>New sidebar footer</strong> — Sign Out and My Settings buttons, plus Salesforce and Outlook connection status, matching ImpactIQ.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>70px header and Admin menu</strong> — The header shows the page title on the left and the company graphic on the right, the CriteriaIQ logo sits at the top of the sidebar, and Admin opens a second-tier menu listing its sections. View dropdowns on Admin pages are now tab bars.</li>
                  <li>• <strong>No more full-page reloads between pages</strong> — The header, Admin menu and tab bar stay in place when you switch pages or tabs.</li>
                  <li>• <strong>Simpler n8n page</strong> — Trimmed to Connection, API keys and Event subscriptions.</li>
                  <li>• <strong>Email metrics in System Health</strong> — The Email tab shows sent counts, success rate and the recent-email table that used to live on Email Configuration.</li>
                  <li>• <strong>Sign-in screens</strong> — Cards and the language menu follow dark mode.</li>
                  <li>• <strong>Naming</strong> — The browser tab reads "CriteriaIQ | Technical Validation", and Help › Getting Started is now Guide.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Header logo and page background for everyone</strong> — These were loaded from an admin-only endpoint, so non-admins never saw them.</li>
                  <li>• <strong>Primary buttons follow the theme</strong> — A global rule forced them to one blue.</li>
                  <li>• <strong>Webhook JSON bodies</strong> — The <code>{"{{json}}"}</code> helper inserted raw JSON inside quoted strings, so bodies with object values failed to parse.</li>
                  <li>• <strong>Report Builder</strong> no longer shows two headers.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.8.1 */}
        <AccordionItem
          value="v0.8.1"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.8.1
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 11, 2026</strong> - Simplified Navigation, Allowed Login Methods &amp; User-Management Security
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>User-management writes now require authorization</strong> — Creating, editing, archiving users and changing roles or section permissions previously only required a signed-in session. Writes now need Admin or edit access to User Management; granting Admin, editing an Admin or protected account and section-permission changes are Admin-only; protected accounts can't be archived; and the edit route whitelists its fields so password, MFA and SSO data can't be mass-assigned. <code>PUT /api/users/me</code> no longer lets users change their own account.</li>
                  <li>• <strong>User and permission lists no longer leak credentials</strong> — <code>GET /api/user-permissions</code> returned every user's full record, including password hashes, TOTP secrets and Salesforce tokens. It now returns a display-only projection scoped to the caller unless they can view User Management, and Customer, Guest and Partner users only see internal staff plus external users who share one of their accounts.</li>
                  <li>• <strong>Credential fields stripped from user responses</strong> — Password hashes and other credential fields are removed from every user API response.</li>
                  <li>• <strong>Dependency updates</strong> — <code>postcss-selector-parser</code> forced to 7.1.6 (quadratic-CPU advisory), plus <code>proxy-addr</code>, <code>source-map-js</code> and <code>i18next-http-backend</code> bumps.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Allowed Login Methods per user</strong> — Admins can set each user to Okta only, Okta + Password, or Password only from the Create/Edit User dialog. The rule is enforced on password login (checked only after the password verifies, so it can't be probed) and on the Okta callback, and Profile → Security shows the setting read-only.</li>
                  <li>• <strong>Job-based sidebar</strong> — Navigation is grouped into Home, Work, Library, Insights, Admin and Help, with at most two levels. Projects and Accounts are now <strong>Project Workspace</strong> and <strong>Account Management</strong>; System Health, Integrations, Archive Management and Support &amp; Features moved under Admin; each page's top tab bar is generated from its sidebar sub-items.</li>
                  <li>• <strong>Support contact email setting</strong> — A new System Settings → Media field drives every "Get Help" link and error page; links are hidden when it is unset.</li>
                  <li>• <strong>Global Search follows the sidebar</strong> — Page results are built from the sidebar menu and show where each page lives (for example "Admin › Archive Management"), so moves and renames carry over automatically.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Internal staff detection</strong> — Internal staff are detected from Domain Allow List entries linked to an internal account.</li>
                  <li>• <strong>Cleaner pages</strong> — In-page title cards were removed across Dashboard, Analytics, Communications, Value Realization Lifecycle, Configuration, System Health, Integrations and Archive Management, so Search &amp; Filters is the first card, with a consistent 16px gap under the header and tab bar.</li>
                  <li>• <strong>Sidebar polish</strong> — 240px wide so labels fit with the scrollbar showing, 14px/12px menu tiers, expand arrows aligned in one column, and group headings in brand blue in light mode.</li>
                  <li>• <strong>Faster tab switching</strong> — Pages that moved to a new sidebar section load as real tabs of that section instead of reloading their old page.</li>
                  <li>• <strong>Header and profile</strong> — The language button is icon-only with a hover label, the security shield tooltip is translated, and the sidebar footer and profile block spacing is tighter.</li>
                  <li>• <strong>Outcome Intelligence</strong> — Views are sidebar tabs and KPIs sit inside Search &amp; Filters; the 2FA method toggle is more compact.</li>
                  <li>• <strong>Codebase cleanup</strong> — Dead files removed, duplicate client folders merged, server route files moved into <code>server/routes/</code>, and docs renamed to kebab-case with plans and archived notes in their own folders.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Global Search no longer crashes when opened.</strong></li>
                  <li>• <strong>Duplicate views removed</strong> — The second Environment Variables view in System Settings and duplicate Dependencies, Assumptions, Competitor Intelligence and Outcome Intelligence entries are gone.</li>
                  <li>• <strong>Report Builder</strong> — The View dropdown spacing now matches every other page.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.8.0 */}
        <AccordionItem
          value="v0.8.0"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.8.0
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 7, 2026</strong> - Okta SSO, Node 24 Runtime &amp; Integration Hardening
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Okta OIDC single sign-on for internal users</strong> — Admin, Engineer, Manager, CX, Sales and Support roles can sign in with <strong>Continue with Okta</strong> once an admin configures the IdP under Configuration → Integrations → Single Sign-On. Identity is keyed on the IdP <code>sub</code> claim (never the mutable email), <code>email_verified</code> is required before JIT-provisioning or linking, and existing password users must confirm their CriteriaIQ password before linking. Includes group → role mapping, an optional "Trust Okta MFA" setting, an <code>SSO_DISABLE</code> break-glass env override, a Single Sign-On Posture card on Security Health, an Okta card on Integration Health, and an Identity Source column on User Management.</li>
                  <li>• <strong>ENCRYPTION_KEY rotation covers SSO and n8n secrets</strong> — The Okta client secret (<code>sso_config.client_secret_enc</code>) and the n8n API key (<code>n8n_config.api_key_enc</code>) are now re-encrypted when an admin rotates the encryption key. Previously both stayed under the old key, breaking SSO login and the n8n integration until re-entered by hand.</li>
                  <li>• <strong>Dependency security sweep</strong> — Resolved 16 of 17 open Dependabot alerts, including one critical: Puppeteer 25 (drops the vulnerable extract-zip and basic-ftp chain), Tiptap 3.31, tsx 4.23, uuid and esbuild overrides, and removal of an unused legacy <code>client/package.json</code> manifest.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Salesforce field-mapping validation &amp; dry-run preview</strong> — Admins can validate field mappings before a sync (duplicate mappings, missing required fields, orphaned mappings, field existence, createable/updateable access, type compatibility, picklist value-map coverage) and preview the exact sync payload for a linked record with zero writes to Salesforce.</li>
                  <li>• <strong>Microsoft Graph email hardening</strong> — Graph send failures are now classified as authentication, permission or throttling errors with admin-actionable guidance; short throttles get one bounded retry; a read-only token-cache status readout was added; and "Verify credentials" now shares the System Health probe, so certificate-mode credentials are supported.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Node 24 LTS runtime</strong> — The Docker image (builder and runtime stages), CI and the native installer now run Node 24. Node 20 reached end-of-life in April 2026.</li>
                  <li>• <strong>Continuous integration</strong> — Every pull request and push to main now runs type-checking, the full build (all 15 lint gates plus the bundle) and the unit-test suite on GitHub Actions. About 151 long-failing tests across 40 files were fixed so the suite starts green.</li>
                  <li>• <strong>Documentation housekeeping</strong> — Local-dev and self-hosting guides no longer hardcode machine-specific clone paths, and the documented lint-gate count is corrected to 15.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Salesforce features restored in production</strong> — A September dependency update moved the Salesforce library onto a networking package that requires Node 22.19+, so every Salesforce feature returned an error on the Node 20 runtime. Fixed by the Node 24 upgrade.</li>
                  <li>• <strong>Profile → Connect to Salesforce works with admin-UI-only OAuth</strong> — The Profile page used a separate, env-var-only OAuth configuration and failed with "OAuth is not configured" whenever Salesforce OAuth was set up only under Configuration → Integrations. All Salesforce OAuth now goes through the single database-backed configuration.</li>
                  <li>• <strong>Salesforce value-map translations</strong> — Fields with a value-map translation were writing a stringified result object into the target record instead of the translated value; a failed strict-mode translation now skips the field and reports the error.</li>
                  <li>• <strong>SSO card background icon</strong> — The decorative icon on the Single Sign-On configuration card no longer spills across the whole page and now matches the card's Shield icon.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.60 */}
        <AccordionItem
          value="v0.7.60"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.60
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>June 26, 2026</strong> - Email Automation, Access Codes &amp; Onboarding Polish
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Per-announcement celebration frequency controls</strong> — Each announcement's celebration effect now has two admin-configurable toggles: "Fire on click of Bell row / Bottom Banner" (first click only vs every click) and "Fire on login / page load" (first login only vs every login). Both default to "first" with per-browser tracking via localStorage so users aren't bombarded.</li>
                  <li>• <strong>Animated announcement bell + click-to-celebrate</strong> — When there are unread announcements the header bell switches to <code>BellRing</code> and shake-animates (2.4s loop with a 70% pause) until clicked. Clicking the bell row or the bottom banner re-fires the celebration so users who missed the initial page-load burst still get the moment.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Rebrand-resilient default email design</strong> — Server-side wrapper, template create dialog, and admin form all look up the default email design via the <code>is_default = true</code> flag instead of the literal name "CriteriaIQ Default". Renaming the design (or installs that pre-date the rebrand) no longer break the wrapping or auto-select.</li>
                  <li>• <strong>Branch hygiene &amp; merge policy</strong> — Repo settings now auto-delete merged branches; <code>CLAUDE.md</code> documents "Create a merge commit" as the default merge strategy to prevent the phantom-ahead state that recurred across squash merges in v0.7.51 / v0.7.52.</li>
                  <li>• <strong>System templates always wrap with a design</strong> — Both the email-template preview endpoint and the test-send endpoint fall back to <code>getDefaultEmailDesign()</code> when a template's <code>designId</code> is null, matching the live send pipeline. The seeder no longer clobbers an admin-edited <code>designId</code> on every server boot. The hardcoded legacy vendor logo image baked into the email module's fallback was replaced with a bundled CriteriaIQ logo so any asset-resolution failure renders the new branding instead of the legacy Internal red.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Access codes honour their assigned role</strong> — Code-based signup now reads the trusted <code>assigned_role</code> column server-side instead of dropping it during the anti-privilege-escalation guard. An Admin-tagged code now correctly creates an Admin user; the role-injection guard against <code>req.body.role</code> stays intact.</li>
                  <li>• <strong>Edit Email Template dialog hydrates synchronously</strong> — The Email Design dropdown now shows the template's configured design (e.g. "CriteriaIQ Default") on first paint instead of "No Email Design Wrapper Template", and the Category / Email Type fields hydrate correctly too. Root cause was a post-mount <code>useEffect</code> hydration plus stale-closure <code>{'setFormData({...formData, X})'}</code> handlers — fixed via a lazy <code>useState</code> initializer plus functional-updater patterns across every callsite.</li>
                  <li>• <strong>Email Automation rules now actually deliver AND the Execution Feed / KPI cards reflect reality</strong> — Five connected schema-mismatch bugs in the audit pipeline + <code>send_email</code> action left the Welcome Email rule firing into the void with no audit row, no feed entry, and no email actually sent (template lookup by non-existent <code>key</code> column, body placeholder reads from non-existent <code>htmlBody</code> field, audit insert columns absent from schema, audit gate on <code>projectId</code> excluded user-lifecycle triggers, consumers reading dead column names). All fixed; the <code>email_rule_audits</code> table is populated again and the Automation Feed shows real numbers.</li>
                  <li>• <strong>Edit dialog no longer remounts on every parent render</strong> — The <code>key</code> prop on the email-template Edit dialog mixed <code>Date.now()</code> into its value, forcing unmount/remount on every parent re-render and resetting in-flight form state. Stable key based on the template id only.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.52 */}
        <AccordionItem
          value="v0.7.52"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.52
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>June 23, 2026</strong> - Error Audit Log Analytics, Smarter Tags &amp; Cleaner CSV Import
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Error Audit Log analytics</strong> — Five new filter dimensions (Version / URL / Severity / User / Date Range) in a two-row layout. Charts now share the <code>/api/error-logs</code> cache and stay in sync with the active filter set, so the pie chart and the row list always describe the same slice of errors.</li>
                  <li>• <strong>Per-row JSON download</strong> — Every Error Audit Log entry now ships with a one-click JSON download button. The payload includes the full row plus the normalized severity and the new <code>selfRecovered</code> flag, ready to hand to an LLM or paste into an incident ticket.</li>
                  <li>• <strong>Self-recovered marker for transient JSON errors</strong> — Client errors with <code>details.nonJsonResponse === true</code> (typically a Dokploy redeploy briefly serving HTML where JSON was expected, which the frontend's retry path already swallowed) are now classified as Low severity and tagged with a green "Self-recovered" sub-badge. The flag also flows through to the JSON download so triage explicitly sees that the row was already handled.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Solutions tag dropdown UX</strong> — The Solutions tag picker is now a searchable dropdown with type-ahead filtering. Unknown tags get distinct, stable fallback colors via a deterministic hash (<code>colorFromTagName</code>) instead of all collapsing into gray, so visually distinguishing tags at a glance works even before they're registered in the <code>tags</code> table.</li>
                  <li>• <strong>CSV import template &amp; "How to Import" guide</strong> — The downloadable CSV template and the in-app "How to Import" sample data are now made vendor-neutral and reference the real <code>SYSTEM_TAGS</code> dictionary so the example values actually round-trip through the importer.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Edit Project — stale customer logo</strong> — The "Account &amp; Company Logo" field now reads the live <code>customers.logo_url</code> instead of the denormalized snapshot stored on the project, and falls back to a "No logo available" placeholder when the URL 404s (previously a broken-image icon).</li>
                  <li>• <strong>Account Portal — role-aware drawers</strong> — MAP drawers now respect the viewer's role: read-only viewers see view mode, editors see edit mode. Previously the drawers always opened in the same mode regardless of permission.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.51 */}
        <AccordionItem
          value="v0.7.51"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.51
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>June 18, 2026</strong> - Storage Architecture, Files DB &amp; Flight Deck Overhaul
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Files Database storage provider</strong> — A new <code>db</code> storage driver persists uploaded blobs into a dedicated Postgres database (<code>criteriaiq_files</code> by default) via a BYTEA <code>uploaded_files</code> table. Pairs with the existing GCS, AWS, Azure, and Local Disk drivers so admins can keep files inside the database tier without an external bucket.</li>
                  <li>• <strong>Storage Providers admin page</strong> — Configuration → System Settings → Storage Providers consolidates provider selection, credential entry, Test Connection, and the Files DB status panel (name, derivation source, ready state) in one editable surface. The System Health → Storage page is now a read-only status mirror.</li>
                  <li>• <strong>Storage Path Conventions drill-down</strong> — Every row in the System Health Storage Path Conventions and Files Database tables is now expandable to show the actual files (object key, size, upload date). Backed by two new admin endpoints, with a Customer Logos fallback that surfaces stale metadata even when the file no longer resolves.</li>
                  <li>• <strong>Storage Path Conventions accuracy</strong> — Path totals now merge main-DB document metadata with the files-DB <code>uploaded_files</code> table, so Flight Deck Images, Email Design Assets, Solution Icons, and Rich-Text Images report real byte counts instead of <code>—</code>. A new Files column shows per-context object counts.</li>
                  <li>• <strong>Account Portal project card refresh</strong> — Project cards now show solution icons with a <code>|</code> separator, tag pills under the solution name, and the customer status + end-date row at the top. The progress ring is absolute-positioned in the top-right so it doesn't inflate row height.</li>
                  <li>• <strong>Shared StatusBadge component</strong> — A canonical render path at <code>client/src/components/shared/StatusBadge.tsx</code> for any value sourced from <code>/api/status-configs</code> or <code>/api/customer-status-configs</code>. Two variants (<code>solid</code> for cells, <code>darkRail</code> for gradient headers) and three sizes; documented in CLAUDE.md as the only allowed code path for status pills.</li>
                  <li>• <strong>Flight Deck per-widget "Show Expanded" toggle</strong> — Every widget (Resume Button, Health Pulse, Risk Radar, Hygiene Alerts, Jumpstart, Philosophy, What's New) can be marked expanded-by-default per rule. Default is collapsed; users can click a collapsed strip to expand for the session.</li>
                  <li>• <strong>Flight Deck "Use CriteriaIQ logo" toggle</strong> — Header and Footer Image inputs now have a checkbox that authoritatively uses the bundled CriteriaIQ logo (light/dark aware) instead of falling back through a URL field. State persists across saves.</li>
                  <li>• <strong>Solution Icons admin manager</strong> — Configuration → System Settings → Media gained a Solution Icons card listing every icon under <code>system/solution-icons/</code> with thumbnail, editable display name, and delete action. Display names surface in the Validation Criteria → Solutions dropdown.</li>
                  <li>• <strong>Email Designs revamp</strong> — Graphic 1/2/3 are now dropdowns bound to Available Assets, Logo and Graphic uploads route through the unified <code>processUpload</code> pipeline, the path display reflects the active storage provider dynamically, and the dialog is fully dark-mode-correct.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>CriteriaIQ Default email design</strong> — The system-seeded default email design is renamed to "CriteriaIQ Default", logo defaults to <code>criteriaiq-logo-dark.png</code> (the white wordmark for the dark blue header), and Footer Line 2 reads <code>© CriteriaIQ. All rights reserved.</code> Existing rows are upgraded in place by the seeder catch-up branch.</li>
                  <li>• <strong>Unified upload pipeline coverage</strong> — Flight Deck images, Email design assets, and Solution icons now all flow through <code>processUpload</code> → quarantine → validate → sanitize → scan → promote, with consistent 2 MB / 1 MB limits and standard MIME allowlists. Replaces three ad-hoc upload paths that had drifted on size and format.</li>
                  <li>• <strong>Active vs. selected provider clarity</strong> — The Storage Providers form now distinguishes between the active (currently-serving) provider and the selected (being-edited) provider, with an explicit Enable toggle and a Set-Active confirmation dialog warning that the Files DB lookup follows the main DB connection.</li>
                  <li>• <strong>Files-DB info on Database Connections</strong> — Each Database Connection card now shows a read-only File storage line indicating which files DB derives from that connection, so admins understand the linkage before switching active databases.</li>
                  <li>• <strong>How-to-set-this note in Storage Providers</strong> — The Database tab explains that the Files DB name is auto-derived from <code>DATABASE_URL</code> or the active connection (with the manual <code>FILES_DATABASE_URL</code> override documented).</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Flight Deck Resume / Health Pulse / Risk Radar surfaced demo projects</strong> — All three engineer-facing widgets now filter <code>projects.is_demo = false</code> at the data layer, so demo-mode seed rows no longer inflate metrics or show up as the "Resume" prompt.</li>
                  <li>• <strong>Account Portal status pills rendered as defaults</strong> — Tailwind 4 silently dropped the <code>bg-[--var]</code> shorthand syntax. Fixed by switching to <code>bg-[var(--var)]</code> and adopting the shared StatusBadge so this class of regression can't recur.</li>
                  <li>• <strong>Email Designs right-title rendered centered</strong> — The preview wrapper now sets <code>min-width: 735px</code> and the template's nested <code>&lt;table width="555"&gt;</code> got inline <code>style="width: 555px"</code> so the Right Title column actually right-aligns.</li>
                  <li>• <strong>Email Designs preview logo broken-image</strong> — The DOMPurify sanitizer required an absolute URL on <code>img src</code>; the asset path is now qualified with <code>window.location.origin</code> at preview render time.</li>
                  <li>• <strong>Flight Deck checkbox not respected at render</strong> — The "Use CriteriaIQ logo" toggle is now checkbox-authoritative (checked → always bundled logo; unchecked → URL or nothing). Persists via two new boolean columns on <code>flight_deck_configs</code>.</li>
                  <li>• <strong>Stale Customer Logo metadata</strong> — Cleared a phantom 23 KB rollup on customer #31 whose <code>logo_url</code> referenced a file deleted in an earlier Internal-asset sweep. A generic orphan-cleanup spec is captured at <code>docs/features/storage-orphan-cleanup.md</code> for a follow-up release.</li>
                  <li>• <strong>Flight Deck widget "Show Expanded" not respected at runtime</strong> — The user-facing data feed now emits the <code>widgetExpanded</code> map from <code>widgetSettings.expanded</code> so the modal honors per-widget defaults.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.50 */}
        <AccordionItem
          value="v0.7.50"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.50
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>June 5, 2026</strong> - Microsoft Graph Email, Documentation Overhaul &amp; Observability
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Microsoft Graph email sending</strong> — Email Configuration can now send via the Microsoft Graph <code>sendMail</code> API using app-only OAuth (no mailbox password). Supports a client secret or a certificate; both are encrypted at rest (AES-256-GCM) and rotate with the ENCRYPTION_KEY. The secure path for Microsoft 365 now that SMTP Basic Auth is deprecated.</li>
                  <li>• <strong>Least-privilege guidance built in</strong> — The setup flow documents the <code>New-ApplicationAccessPolicy</code> step that locks the app to a single sender mailbox, so a compromise can't impersonate other mailboxes.</li>
                  <li>• <strong>Fresh-install error-log reset</strong> — The Client Error Audit Log now starts empty on a new install (leftover rows from a re-pointed dev/test database are cleared when no admin exists yet).</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Client Error Audit Log</strong> — Browser-side errors are captured and surfaced on About → Support &amp; Features → Error Audit Log with severity classification, resolved user names, a "File as Support Request" action, and a Client Errors KPI tile.</li>
                  <li>• <strong>System Health demand cards</strong> — Configuration → System Health adds Feature Requests (warning &gt; 0), Support Requests and Client Errors (error &gt; 0) tiles that roll into the headline Healthy / Warnings / Errors counts.</li>
                  <li>• <strong>Report Builder expansion</strong> — Color-coded source groups, a dynamic JOIN executor, a new Validation Criteria source, and per-source filter examples.</li>
                  <li>• <strong>Microsoft Entra setup runbook</strong> — A step-by-step Graph-email app-registration guide, linked directly from the Email Configuration page.</li>
                  <li>• <strong>New / Updated doc badges</strong> — Documentation cards show a "New" or "Updated" badge for 2 days after a doc is added or changed.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Global search refreshed</strong> — The command palette now indexes all 60+ documentation articles, and clicking a doc result opens that document (previously it only landed on the Documentation tab).</li>
                  <li>• <strong>Accurate documentation dates</strong> — "Posted / Updated" dates are derived from git history instead of hand-maintained strings that had drifted (one was even dated in the future), and now render correctly in production.</li>
                  <li>• <strong>11 new documentation articles</strong> — Report Builder, System Health Dashboard, Encryption Key Rotation, Approved Email Domains, Standard Table Pattern, Storage Mixin Architecture, Secrets Management, Client Error Capture, Email Sending (SMTP &amp; Graph), the Entra runbook, plus accuracy fixes across existing docs.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>"Unexpected token '&lt;'" on page load</strong> — API calls that received an HTML page (e.g. during a deploy or from a proxy) now surface a clear, retryable error and self-recover, instead of a cryptic JSON parse error logged as a client error.</li>
                  <li>• <strong>Error Audit Log crash</strong> — Fixed an infinite-render loop that tripped React's update-depth limit when opening the Error Audit Log.</li>
                  <li>• <strong>Documentation dates blank in production</strong> — The production build excluded git history; doc dates now ship via a committed file so they render on the deployed server.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.40 */}
        <AccordionItem
          value="v0.7.40"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.40
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>June 2, 2026</strong> - Internal Accounts &amp; Login Management Overhaul
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Domain auto-approve now works end-to-end</strong> — Registration honors the Domain Allow List auto-approve rule, and the retroactive approval path now sets the correct approval gate. Previously, users from an approved domain were silently stuck "pending" and could never log in.</li>
                  <li>• <strong>Registration password hardening</strong> — The password chosen at sign-up is now bcrypt-hashed and stored. It was previously validated but never persisted, leaving self-registered accounts password-less until an admin set one.</li>
                  <li>• <strong>No default trusted domain</strong> — Removed the hard-coded <code>example.com</code> allow-list seed; the Domain Allow List starts empty on a fresh install so no organization-specific domain is auto-trusted.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Internal (login-only) Accounts</strong> — A lightweight account type for onboarding internal staff logins. Created from Account Directory via an admin-only "Internal" checkbox and requiring only a name, internal accounts are segregated from all customer-facing selectors (projects, dashboards) and surface only in Login Management.</li>
                  <li>• <strong>Auto-generate login codes from Add Domain</strong> — When adding a domain you can tick "Create login code" to mint an access code automatically (prefix derived from the domain, unlimited uses, never expires), tied to the linked internal account.</li>
                  <li>• <strong>Editable access codes &amp; unlimited codes</strong> — Access codes can now be fully edited (account, role, max uses, expiry) via a new edit dialog, and flagged "no usage limit / never expires".</li>
                  <li>• <strong>Recent Logins on the Security dashboard</strong> — Configuration → System Health → Security now lists the last 3 logins with status (Success / Failed / Locked) and links to the full Login Audit.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Internal-user onboarding guidance</strong> — Login Management shows an admin-only walkthrough for setting up internal users via domains and access codes.</li>
                  <li>• <strong>Smarter registration form</strong> — Company auto-fills from the validated access code and locks; the Solutions field hides for internal accounts; and the selected timezone is now saved (it previously always defaulted to Eastern).</li>
                  <li>• <strong>Edit User: internal specializations</strong> — For internal users, Solutions and Stakeholder Types are auto-set to "None" and locked.</li>
                  <li>• <strong>Account Portal wording</strong> — The empty state now reads "No Accounts Found" with a "Go to Accounts" shortcut, aligning with the Accounts terminology.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Access-code usage tracking</strong> — Code usage is now recorded at registration, so the "Users Who Used This Code" drawer and the usage counts populate correctly (and limited codes count down toward their cap).</li>
                  <li>• <strong>Unlimited codes honored at sign-up</strong> — The public access-code validation endpoint now respects the bypass-limits flag, so an unlimited/never-expiring code is no longer rejected after a single use.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.30 */}
        <AccordionItem
          value="v0.7.30"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.30
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>May 12, 2026</strong> - n8n Integration, AI Provider Enhancements &amp; Documentation Overhaul
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security &amp; Compliance
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>API Keys — bcrypt-only storage</strong> — CriteriaIQ-issued Bearer tokens are stored exclusively as bcrypt hashes; plaintext is returned once at creation and never persisted, eliminating the possibility of key leakage from a database dump.</li>
                  <li>• <strong>n8n API Key — AES-256-GCM encrypted</strong> — The optional n8n-side API key (used by CriteriaIQ to query n8n workflow status) is stored with the same AES-256-GCM scheme as Salesforce credentials; never in plaintext.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>n8n Bidirectional Integration</strong> — Self-hosted n8n can now call any CriteriaIQ REST endpoint via scoped Bearer token API keys. An inbound <code>/api/n8n/trigger</code> bridge lets n8n fire any named CriteriaIQ automation trigger, which passes through the full native rule engine (emails, notifications, webhooks all fire as normal). Outbound events flow via the existing Generic HTTP webhook card. API key management UI lives under Configuration → Integrations → n8n.</li>
                  <li>• <strong>AI Provider Model Combobox</strong> — Replaced the broken <code>&lt;datalist&gt;</code> with a Command-based inline dropdown; admins can type any custom model name or pick from 6 curated suggestions per provider. All 6 suggestions appear on focus; typing narrows the list in real time.</li>
                  <li>• <strong>About Page Documentation Dates</strong> — Every documentation card in About → Documentation now displays "Posted" and "Updated" timestamps with a calendar icon, providing provenance at a glance.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>n8n Sidebar Navigation</strong> — n8n is now a first-class sidebar item under Configuration → Integrations alongside Salesforce and AI Providers, making it discoverable without knowing where to look.</li>
                  <li>• <strong>AI Provider Model Lists Refreshed</strong> — All 5 provider model lists updated to the latest releases: Anthropic claude-sonnet/opus/haiku 4.6 &amp; 4.7, Gemini 2.5 Flash/Pro/Flash-Lite, OpenAI GPT-4.1/4.1-mini/o4-mini/o3, Grok 3 family, Azure OpenAI GPT-4o/4.1. Six curated models per provider, newest first.</li>
                  <li>• <strong>Documentation Coverage Expanded</strong> — 8 previously-undocumented guides added to About → Documentation: N8N Integration, Demo Mode, Future Enhancements, Adding a New Language, Migration Strategy, Local Dev Setup, Dokploy/Traefik Timeouts, and Native Install.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>AI Provider Model Dropdown Race Condition</strong> — <code>onMouseDown</code> + <code>e.preventDefault()</code> prevents the input from blurring before the click fires, so clicking a suggestion reliably selects it. Separate <code>modelQuery</code> state (reset to empty on focus) ensures all 6 suggestions appear regardless of the current saved value.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.20 */}
        <AccordionItem
          value="v0.7.20"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.20
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>April 30, 2026</strong> - Multi-DB Management, Secret Lifecycle &amp; Cleanup Schedulers
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security Changes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>App-Managed Bootstrap Secrets (Task #741)</strong> — <code>SESSION_SECRET</code> and <code>ENCRYPTION_KEY</code> can now be promoted out of host-env into the encrypted app file or unmanaged back to host-env, with per-row Promote/Unmanage buttons on the Bootstrap Secrets card and masked Reveal-for-10s buttons on the Environment Variables panel. Reveal calls are suppressed from access logs and the env-status endpoint serves a server-rendered, credentials-masked URL preview by default so plaintext never crosses the wire.</li>
                  <li>• <strong>Encryption-Key Rotation Race Closed (Task #726)</strong> — Process-memory dual-key decrypt fallback eliminates the COMMIT/env-swap race where rows encrypted under the old key could become unreadable mid-rotation.</li>
                  <li>• <strong>Forced Logout on Session-Secret Rotation (Task #724, #736)</strong> — Rotating <code>SESSION_SECRET</code> now invalidates every active admin session and surfaces a &ldquo;you&rsquo;ve been logged out&rdquo; notice on the next page load.</li>
                  <li>• <strong>Rotation-In-Progress Banner (Task #734)</strong> — Live status banner shows countdown and re-encryption progress during the brief encryption-key rotation window.</li>
                  <li>• <strong>Boot-Time Data-Directory Health Check (Task #741)</strong> — Server probes <code>/data</code> writability at startup and on every health check; result is surfaced via <code>/api/system/health</code> so a read-only mount is caught before it silently breaks secret promotion or backups.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Multi-DB Connection Management (Task #739)</strong> — File-canonical store (<code>/data/db-config.json</code>) for managing multiple named database connections with AES-256-GCM-encrypted URLs, per-connection driver/SSL settings, and a typed-confirm safety gate on every destructive edit.</li>
                  <li>• <strong>Set-Active-for-Next-Restart Flow (Task #740)</strong> — Operators can stage a database switch that takes effect on the next restart instead of mid-request, via three new endpoints (GET / POST / DELETE <code>/api/db-connections/pending-active</code>) and a banner showing the pending target.</li>
                  <li>• <strong>Sessions Cleanup Scheduler &amp; Admin Panel (Task #737, #745, #752)</strong> — Daily scheduler drops expired session rows; new &ldquo;Sessions Cleanup&rdquo; card on System Health → Database surfaces last-run timestamp, row count, duration, and an admin &ldquo;Run now&rdquo; button.</li>
                  <li>• <strong>Login-History Cleanup Scheduler &amp; Admin Panel (Task #746, #751, #756)</strong> — Daily prune of <code>audit_logins</code> with configurable retention; new &ldquo;Login history cleanup&rdquo; card on System Health → Database with admin &ldquo;Run now&rdquo; gated by a confirmation dialog (Task #758).</li>
                  <li>• <strong>Bootstrap Secrets &amp; Installed DB Visibility (Task #719)</strong> — New System Settings panel surfaces which secrets are app-managed vs host-env-managed and which database connection the install is currently using.</li>
                  <li>• <strong>Install-Time DB Row on Host-Env Installs (Task #731)</strong> — Fresh self-hosted installs see the install-time <code>DATABASE_URL</code> rendered as a real connection row in the manager so it can be promoted, edited, or replaced through the UI like any other connection.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Repo-Wide JSON-Parsing Antipattern Sweep (Task #754)</strong> — Eliminated the broken <code>JSON.parse(await response.text())</code> pattern across the codebase, locked in via lint rule + regression tests.</li>
                  <li>• <strong>Audit-Logins Cleanup Snapshot Persists Across Restarts (Task #757)</strong> — Last-run snapshot stored on disk so the System Health card survives rolling deploys and OOM kills.</li>
                  <li>• <strong>Connection-Store Cleanup (Task #743)</strong> — Removed the unused <code>pendingActiveAnnouncementId</code> slot from the connection store; it was always null and risked cross-DB orphaned rows.</li>
                  <li>• <strong>Documentation Sync Workflow (Task #720)</strong> — Stopped auto-creating the Documentation Sync workflow schedule on boot; admins now opt in explicitly.</li>
                  <li>• <strong>Archived-User Notice Dismissal (Task #721)</strong> — New <code>dup_cleanup_notice_dismissed_at</code> column on <code>archived_users</code> preserves per-user dismissal state for the duplicate-cleanup notice.</li>
                  <li>• <strong>Bootstrap-Secrets Regression Suite (Task #725, #744)</strong> — New tests pin the call-order contract for the bootstrap-secrets reveal/regenerate handlers and the <code>seedBootstrapDbConnection</code> flow.</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Hidden Secret-Rotation Copy Dialog (Task #749)</strong> — Broken JSON parsing was silently swallowing the new-key dialog after a successful rotation, leaving admins with no way to copy the freshly minted secret.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.10 */}
        <AccordionItem
          value="v0.7.10"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.10
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>April 23, 2026</strong> - First-Run Setup &amp; Self-Hosting Bootstrap
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security Changes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Production Secret Hardening</strong> — New <code>enforceProductionSecrets()</code> guard fails fast in production when <code>SESSION_SECRET</code> or <code>ENCRYPTION_KEY</code> is missing once an approved admin exists. During the first-run bootstrap window, safe values are auto-generated so a fresh install never deadlocks on missing secrets.</li>
                  <li>• <strong>Status-Only vs Mutating Setup Routes</strong> — <code>/api/setup/status</code> remains available at all times for health checks, while mutating bootstrap endpoints (<code>/initialize</code>, <code>/create-admin</code>, <code>/smtp</code>, etc.) are only registered during the bootstrap window and rejected once the system is initialized.</li>
                  <li>• <strong>Lazy Encryption Key Resolution</strong> — <code>mfaUtils.ts</code> now resolves <code>ENCRYPTION_KEY</code> at call-time, allowing wizard-generated keys to be used in the same boot without restarting the process.</li>
                </ul>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>7-Step First-Run Setup Wizard</strong> — Fresh self-hosted installs are guided through Database → Schema Migration → Admin Seed → Session/Encryption Secrets → SMTP → Public URL → Done with a live health panel.</li>
                  <li>• <strong>Self-Hosting Artifacts</strong> — Production-ready <code>Dockerfile</code> (multi-stage, prunes dev deps then re-installs <code>drizzle-kit</code> for the wizard&rsquo;s schema-push step), <code>docker-compose.yml</code> with Postgres service, and an expanded <code>.env.example</code> covering optional cloud storage (S3/MinIO/R2/GCS/Azure Blob) and AI providers (OpenAI, Anthropic, Gemini, Azure OpenAI).</li>
                  <li>• <strong>Self-Hosting &amp; First-Run Setup Documentation</strong> — Two new guides: <code>docs/features/first-run-setup.md</code> (wizard walkthrough + secret resolution model) and <code>docs/guides/self-hosting.md</code> (docker-compose, Hostinger VPS, and Dokploy deployment paths). Both are linked from the About page and registered in <code>searchConfig</code>.</li>
                  <li>• <strong>Live Public-URL Reachability Probe</strong> — The Done step performs a real <code>fetch</code> against <code>${"{PUBLIC_APP_URL}"}/api/health</code> and reports the round-trip status, catching DNS, TLS, and reverse-proxy misconfiguration before the admin leaves the wizard.</li>
                  <li>• <strong>Real Database Probe in Setup Status</strong> — <code>/api/setup/status</code> now executes a real <code>SELECT 1</code> against the configured <code>DATABASE_URL</code> and returns <code>dbReachable</code>, replacing the previous env-only check.</li>
                  <li>• <strong>Deferred SMTP Hydration</strong> — <code>smtp-hydrate.ts</code> applies wizard-supplied, encrypted SMTP settings on the first boot after setup completes, so emails work immediately without a manual restart.</li>
                  <li>• <strong>Rich-Text Editor Migration: MDXEditor → Tiptap (Task #196)</strong> — Big-bang replacement of <code>@mdxeditor/editor</code> with <strong>Tiptap v3</strong> across all 9 editor call sites (project notes, requirements, code-script descriptions, system announcements, customer artifacts). Markdown remains the storage format via <code>tiptap-markdown</code>, and a custom Admonition node round-trips <code>:::type … :::</code> fences losslessly. Four toolbar variants (<code>full</code> / <code>compact</code> / <code>minimal</code> / <code>code</code>), bubble menu, character/word count footer, @-mention typeahead, <code>:emoji:</code> shortcode picker, image upload with alignment, tables with header rows + resize + merge/split, task lists, YouTube embeds, syntax-highlighted code blocks (lowlight), and sub/super/highlight/text-color all included.</li>
                  <li>• <strong>Tiptap Markdown Round-Trip Regression Suite (Task #204)</strong> — 42 round-trip fixtures across 8 files (64 tests total with the admonition unit suite) covering admonitions, blocks, lists, marks, media, mentions, tables, and YouTube embeds; runs in seconds via Vitest to lock in storage compatibility for every supported block.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Tiptap Component &amp; File Rename</strong> — All <code>Mdx*</code> rich-text editor files and components renamed to <code>Tiptap*</code> (e.g., <code>MdxEditor</code> → <code>TiptapEditor</code>, <code>MdxField</code> → <code>TiptapField</code>) for naming consistency with the underlying engine.</li>
                  <li>• <strong>Tiptap Lazy-Load &amp; Pre-Bundle Optimization</strong> — Editor and its dependencies are lazy-loaded via <code>React.lazy</code> + <code>Suspense</code> and pre-bundled into a dedicated <code>vendor-editors</code> chunk in <code>vite.config.ts</code>, keeping the initial app bundle small while eliminating the cold-cache 504 timeout that previously occurred when opening editor cards.</li>
                  <li>• <strong>Expanded Tiptap Editor Documentation</strong> — <code>docs/features/tiptap-editor-system.md</code> rewritten with full coverage of architecture, toolbar variants, extensions, storage format, admonition handling, mentions/emoji, lazy loading, testing, and migration history.</li>
                  <li>• <strong>Conditional Bootstrap Gating</strong> — <code>server/index.ts</code> now detects whether an approved admin exists and either enables auto-generated bootstrap secrets (fresh install) or enforces strict fail-fast hardening (post-setup), eliminating the docker-compose first-boot deadlock without weakening production posture.</li>
                  <li>• <strong>Smarter Auth Redirects</strong> — <code>useAuth</code> treats <code>401</code> and <code>503</code> responses as a signal to check <code>/api/setup/status</code> and route uninitialized installs to <code>/setup</code> instead of looping back to the login page.</li>
                  <li>• <strong>Lazy Secret Helpers</strong> — New <code>server/lib/app-config.ts</code> exposes <code>getSessionSecret()</code>, <code>getEncryptionKey()</code>, and <code>getPublicAppUrl()</code> as call-time getters so values written by the wizard (or rotated post-boot) are picked up without restart.</li>
                  <li>• <strong>Persistent Health Panel on Done Step</strong> — The wizard&rsquo;s final step no longer auto-redirects; it polls <code>/api/health</code> and shows a persistent panel with a clear &ldquo;Go to Login&rdquo; action so admins can verify their install before navigating away.</li>
                  <li>• <strong>About Page Reorganization</strong> — &ldquo;First-Run Setup &amp; Bootstrap&rdquo; documentation entry moved into the &ldquo;Development &amp; Components&rdquo; category; the &ldquo;Self-Hosting Guide&rdquo; remains under &ldquo;Deployment.&rdquo;</li>
                </ul>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Docker-Compose First-Boot Deadlock</strong> — Fresh self-hosted containers no longer crash-loop with &ldquo;missing SESSION_SECRET / ENCRYPTION_KEY&rdquo; before the admin can reach the setup wizard.</li>
                  <li>• <strong>Wizard Schema-Push Failure</strong> — The Dockerfile now reinstalls <code>drizzle-kit</code> after pruning dev dependencies, so the wizard&rsquo;s &ldquo;Initialize Schema&rdquo; step succeeds in production images.</li>
                  <li>• <strong>Setup Endpoint Hangs on Empty DB</strong> — The status endpoint&rsquo;s real <code>SELECT 1</code> probe now uses a transient pool with a short timeout so misconfigured <code>DATABASE_URL</code> values surface clearly instead of hanging the wizard.</li>
                  <li>• <strong>Editor Cold-Cache 504 Timeout</strong> — Pre-bundling Tiptap dependencies in Vite resolved the 504 Gateway Timeout that occasionally fired the first time an editor card was opened on a freshly-loaded page.</li>
                  <li>• <strong>Admonition Markdown Round-Trip with Indented &amp; Nested Fences</strong> — Custom Admonition node now correctly preserves indented and nested <code>:::type</code> fences across save/reload, fixing data loss on deeply-structured content.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.7.00 */}
        <AccordionItem
          value="v0.7.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.7.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>April 2, 2026</strong> - Security Stack Hardening, Reports Redesign &amp; UI Improvements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security Changes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Major Dependency Security Hardening</strong> — Full stack upgrade addressing known CVEs across all layers: React 19.2, Express 5.2, TypeScript 6.0, Zod 4.3, Vite 8.0, Drizzle ORM 0.45, Lucide React 1.7, and all Radix UI packages updated to latest versions.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Reports Library Redesign</strong> — Reports section redesigned with collapsible category sections (My Reports, Other Reports, System Reports, Inactive Reports) each wrapped in a Card, with a 4-column card grid layout (<code>minmax(200px, 1fr)</code>) that auto-stretches to fill available width.</li>
                  <li>• <strong>Date Picker Year/Month Dropdown Navigation</strong> — Calendar date picker replaced the previous prev/next arrow navigation with inline year and month dropdowns for fast direct-jump to any date.</li>
                  <li>• <strong>Tech Stack Page Refresh</strong> — Technology Stack section in About → Introduction updated with accurate package versions matching the upgraded stack.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.6.50 */}
        <AccordionItem
          value="v0.6.50"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.6.50
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>March 27, 2026</strong> - Assumptions &amp; Dependencies System, VC Library Improvements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Assumptions Library</strong> — Global library of named assumptions accessible via Validation → Assumptions in the sidebar. Searchable, paginated table with system/active flags, category tagging (admin-managed <code>assumption_categories</code>), solution scoping, and validation check notes. Full CRUD with slide-over sheets.</li>
                  <li>• <strong>Dependencies Registry</strong> — Global registry accessible via Validation → Dependencies in the sidebar. Full CRUD with status tracking (Open / In Review / Blocking / Resolved), owner assignment, due dates, multi-user/team/customer assignment, success-criteria linking, admin-managed dependency categories, and a stats endpoint tracking revenue-at-risk and blocking project count.</li>
                  <li>• <strong>Project Assumptions &amp; Dependencies Tab</strong> — Dedicated tab on every project detail page for linking library assumptions and dependencies to a project, or creating ad-hoc project-specific entries inline. Visibility is admin-controlled via the Deliverability Visibility modal (admin-only by default).</li>
                  <li>• <strong>Criterion Dependencies Drawer</strong> — Per-criterion slide-over drawer in the Validation Criteria section showing which Dependencies are linked to a specific success criterion. Accessible from the criterion list on the project detail page.</li>
                  <li>• <strong>VC Library 4-Category Collapsible Sections</strong> — All six VC Library entity pages (Solutions, Components, Value Mappings, Criteria, Expected Outcomes, Actions) now group items into four labeled, independently collapsible sections: My Items, Other Items, System Items, and Inactive Items. Each section shows an item count badge. My, Other, and System sections expand by default; Inactive collapses. Audit metadata (Created By, Created At, Updated At) is surfaced on every entity card.</li>
                  <li>• <strong>Active/System Toggle Switches in All 6 Dialogs</strong> — All six Add/Edit dialogs in the VC Library now include an "Active" toggle switch (replacing the deprecated Status dropdown) and a "System" toggle switch. Each switch includes an inline description label. New items default to Active=true.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Set-Inactive Toast Fix &amp; Hard Delete for Inactive Items</strong> — Resolved a missing success toast when marking a VC Library item inactive via the overflow menu. Inactive items now display a red "Delete Permanently" button in their Edit dialog that issues a true hard-delete (<code>DELETE /api/...</code>) rather than a soft-delete.</li>
                  <li>• <strong>Detailed Delete Error Messages with Named Entity References</strong> — All VC Library delete endpoints now return structured error JSON (<code>{"{ error, blockedBy: [{ entityType, name }] }"}</code>) when deletion is blocked by dependent records. The UI surfaces these as a formatted named-entity list, replacing the previous generic "in use" message.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.6.20 */}
        <AccordionItem
          value="v0.6.20"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.6.20
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>March 12, 2026</strong> - SubNavPopover Navigation, Error Audit Log Sidebar &amp; URL-Synced Subtabs
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Error Audit Log Sidebar Submenu</strong> — Admin-only 3rd-level sidebar entry under About → Support &amp; Features. Clicking it navigates directly to the error log view and highlights the active item in the sidebar.</li>
                </ul>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>SubNavPopover Navigation for Support &amp; Features</strong> — Replaced custom border-bottom sub-tab buttons with a SubNavPopover hover-dropdown component, consistent with other pages in the application.</li>
                  <li>• <strong>Lifted Filter State for Error Audit Log</strong> — Error log filter state (<code>errorSearchTerm</code>, <code>errorContextFilter</code>, <code>errorUniqueContexts</code>) lifted to the <code>SupportFeaturesTab</code> parent; <code>SearchFiltersSection</code> now appears above the SubNavPopover.</li>
                  <li>• <strong>SubNavPopover Label Wrapping Fix</strong> — Dropdown item labels and title text now use <code>whitespace-nowrap</code> so long entries like "Database Backup Destinations" never wrap to two lines.</li>
                  <li>• <strong>URL-Synced Support &amp; Features Subtab</strong> — <code>SupportFeaturesTab</code> now reads and writes the <code>?subtab=</code> URL parameter; a <code>useEffect</code> syncs internal state when the prop changes, so sidebar 3rd-level links correctly switch the active view.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.6.11 */}
        <AccordionItem
          value="v0.6.11"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.6.11
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>March 11, 2026</strong> - Competitor Intelligence Module, Account Competitor Linking &amp; Detail Drawer Polish
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* New Features - Green */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Competitor Intelligence Module</strong> — Full competitor library accessible via the Project Management sub-navigation. Includes technology space selector (ADS, DSPM, PAM, IGA, FIM, EPM, PW), competitor library grouped by space, and a detail drawer with competitive profile, battlecards, links, related projects, and activity timeline.</li>
                  <li>• <strong>Technology Spaces</strong> — Structured taxonomy with 7 spaces seeded on first load. Each space displays competitor count and acts as a filter for the library.</li>
                  <li>• <strong>Competitor-to-Space &amp; Solution Mapping</strong> — Link competitors to technology spaces (primary space supported) and internal products. Multi-select chip interface on the Add Competitor form.</li>
                  <li>• <strong>Project Competitor Join Table</strong> — Attach competitors to projects with relationship type, competitive stage, threat level (Critical / High / Medium / Low), pricing pressure, and outcome notes for win/loss analysis.</li>
                  <li>• <strong>Competitor Detail Drawer</strong> — Identity header with badges, 2×2 detail cards, collapsible competitive profile, battlecards, external links, related projects with threat badges, and activity timeline.</li>
                  <li>• <strong>Add Competitor Modal</strong> — 4-step guided form: Identity → Spaces → Solutions → Intelligence (strengths, weaknesses, counter-positioning, notes).</li>
                  <li>• <strong>Add Technology Space Modal</strong> — Create new technology spaces with code, name, and description validation.</li>
                  <li>• <strong>Analytics Metrics Strip</strong> — 4 metric cards: Total Competitors, Projects Tagged, High-Risk Opportunities, Most Active Space.</li>
                  <li>• <strong>Seeded Industry Data</strong> — 40+ competitor records auto-seeded on first load with vendor type, pricing, deployment, and company size pre-populated.</li>
                  <li>• <strong>Competitors Connected With (Account)</strong> — New collapsible section in the Create/Edit Account dialog. Select a technology space, then pick a competitor from that space. Color-coded chips persist to the database and are pre-loaded when editing an account.</li>
                </ul>
              </div>
              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Competitor Detail Drawer Badge Colors</strong> — Vendor Type (blue), Deployment (orange), Company Size (purple), Pricing Position (green); all four badges shown in the drawer header. "Aligned Solutions" collapsible section with live API toggle.</li>
                  <li>• <strong>Project Management Sub-Navigation</strong> — "Competitor Intelligence" tab added with Swords icon; URL routed via <code>?subtab=competitors</code>.</li>
                  <li>• <strong>Search &amp; Filter Bar</strong> — Competitor library supports text search, solution filter, and space filter simultaneously with a one-click "Clear filters" button.</li>
                  <li>• <strong>Threat Level &amp; Stage Badges</strong> — Colour-coded threat indicators and stage badges (Won, Lost, Finalist, POC, Active Eval) in related project lists.</li>
                  <li>• <strong>Project Detail Workspace Label</strong> — "Project Deliverables" renamed to "Project Deliverables &amp; Workspace".</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.6.10 */}
        <AccordionItem
          value="v0.6.10"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.6.10
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>March 7, 2026</strong> - Validation Criteria Revamp, Webhook Brand Icons &amp; Smart Step Selection
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* New Features - Green */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Validation Criteria Solution Groups</strong> - Criteria now organized into collapsible solution groups with dark purple gradient headers showing solution icon, name, and count badge. Each group has its own "Add Criterion" footer button — the global "Add Criteria" button is removed from the header.</li>
                  <li>• <strong>Horizontal Accordion Field Layout</strong> - New criterion entries display all 5 fields (Component, Value Mapping, Criteria, Expected Outcome, Actions Taken) as a left-to-right row of collapsible icon panels. Collapsed panels show only the field icon; the active panel shows the full search select. Status dropdown and Delete button always visible on the right.</li>
                  <li>• <strong>5-Step Progress Tracker</strong> - Each "New Criterion Entry" header shows 5 small numbered circles tracking field completion. Purple = complete or active; amber border = required field (Criteria, Actions Taken) empty; gray = skipped optional.</li>
                  <li>• <strong>WebhookWizardModal Brand Icons</strong> - Teams (purple), Slack (dark aubergine with 4-color pinwheel), Generic HTTP (blue globe) rendered as inline SVGs. Step 1 cards redesigned as horizontal rows with 56×56px brand icons and integration type badge pills.</li>
                </ul>
              </div>

              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Smart Initial Step Selection</strong> - New criteria auto-open to the Component accordion step when the solution has components in the database, or Value Mapping otherwise. Solution component data is pre-fetched when the Validation Criteria section loads.</li>
                  <li>• <strong>New Criterion Entry Header</strong> - Renamed from "New Criteria Entry" to "New Criterion Entry"; background changed to light purple for visual consistency with the solution group theme.</li>
                  <li>• <strong>No Solution Dropdown in Criterion Form</strong> - Solution is determined by which group the "Add Criterion" button was clicked in, eliminating a redundant field from the new entry form.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.6.00 */}
        <AccordionItem
          value="v0.6.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.6.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>February 26, 2026</strong> - Database Connection Manager,
                DB Branching &amp; Backup Destinations
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* New Features - Green */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Database Connection Manager</strong> - Database management under Config → System Settings: two-layer architecture (file-based bootstrap + DB table), AES-256-GCM encrypted URL storage; test, activate, and manage named connections.</li>
                  <li>• <strong>Backup Destinations Manager</strong> - Named backup database targets with branch categorization, per-branch defaults, connection testing, and AES-256-GCM encrypted URL storage under Config → System Settings.</li>
                  <li>• <strong>DB Branching System</strong> - Branch categorization (Development/Production/Testing/Q&amp;A/Sandbox/Other) for both DB connections and backup destinations; color-coded collapsible grouped display; per-branch defaults independent of the global active-connection flag.</li>
                  <li>• <strong>First-Boot Setup Wizard</strong> - /setup route with step-by-step wizard for fresh installs with no database configured; pre-DB bootstrap file-based configuration.</li>
                </ul>
              </div>

              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Connection Testing</strong> - MonitorCheck icon test button on both DB Connection and Backup Destination cards; live latency display on success, error message on failure; persisted last-test result with time-ago display.</li>
                  <li>• <strong>Branch-Grouped Card Display</strong> - Collapsible color-coded section headers with item counts; branch-colored item cards with branch icons for both connections and destinations.</li>
                  <li>• <strong>Deletion Protection</strong> - System + active connections (isSystem=true AND isActive=true) locked with icon and tooltip; deletion allowed after activating a different connection.</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.50 */}
        <AccordionItem
          value="v0.5.50"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.50
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>February 25, 2026</strong> - PDF Multi-Tab Capture,
                Email Design Enhancements &amp; UI Improvements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>PDF Download — Multi-Tab Capture</strong> - Rewrote downloadPDF to capture project header once (tabs hidden) then each visible tab section separately; tab visibility automatically respects user roles via DOM querying</li>
                  <li>• <strong>Email Design Variables</strong> - Added "Design &amp; Branding" variable group with 8 new template variables (HEADER_BG, LOGO_SRC, LOGO_ALT, LOGO_WIDTH, LOGO_HEIGHT, RIGHT_TITLE, FOOTER_LINE1, FOOTER_LINE2); Insert Variable dropdown restructured into 3 labeled sections</li>
                  <li>• <strong>StatusDistributionWidget Watermarks</strong> - Watermark background icons added to all 4 metric cards, matching AccountMetricsWidget style</li>
                  <li>• <strong>ResizableModal Scrollbar</strong> - Corrected scrollbar behavior using overflow-y-scroll and removed conflicting overflow-hidden</li>
                  <li>• <strong>Sidebar Width</strong> - Expanded sidebar from 225px to 255px to eliminate horizontal scrollbar for longer menu items</li>
                </ul>
              </div>

              {/* Fixes - Orange */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>PDF Tab Repetition</strong> - Fixed same first tab captured 4 times; replaced DOM .click() with React setActiveTab() + data-tab-value attributes and requestAnimationFrame repaint wait</li>
                  <li>• <strong>EmailTemplatesSection Crash</strong> - Fixed "X is not defined" runtime error caused by missing X icon import from lucide-react</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.40 */}
        <AccordionItem
          value="v0.5.40"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.40
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>February 14, 2026</strong> - GitHub Docs Sync,
                Centralized Scheduling & Schema Reorganization
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* New Features - Green */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>GitHub Documentation Sync Integration</strong> - Sync product documentation from GitHub repositories for AI assessments with solution-to-docs mapping, incremental updates, content caching, and per-criterion doc section selection</li>
                  <li>• <strong>Centralized Scheduling System</strong> - AI assessment analysis and documentation sync scheduling integrated into the Workflow Automation framework with dedicated action types and UI</li>
                  <li>• <strong>AI Assessment Enhancements</strong> - Configurable data sources, custom instructions, detailed audit drawer for project insights, R-Index prefix badges, and assessment jobs section with project filtering</li>
                  <li>• <strong>Centralized Product Configuration</strong> - Searchable combobox dropdown for documentation source product matching</li>
                </ul>
              </div>

              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Schema Reorganization</strong> - Split 5155-line shared/schema.ts into 13 domain-based files with barrel re-export for maintainability</li>
                  <li>• <strong>Codebase Organization</strong> - Automation components reorganized, changelog separated into dedicated component, file structure cleanup</li>
                  <li>• <strong>SubNavPopover Navigation</strong> - Artifact selection updated to use popover component for improved navigation</li>
                  <li>• <strong>Workflow Automation UI</strong> - Color-coded scheduled vs manual job sections, improved frequency display with human-readable labels, wider cards, schedule navigation button</li>
                  <li>• <strong>UI/UX Polish</strong> - Button sizing consistency, role management showing users alongside roles, spacing refinements across Account Management, Templates, and Artifacts pages</li>
                </ul>
              </div>

              {/* Fixes - Orange */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Fixed AI Assessment schedules incorrectly marked as Manual</li>
                  <li>• Fixed documentation sources page crash from API data handling</li>
                  <li>• Fixed service import paths after schema reorganization</li>
                  <li>• Fixed schedule deletion sync across related pages</li>
                  <li>• Fixed toast notifications to use semantic system variants</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.30 */}
        <AccordionItem
          value="v0.5.30"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.30
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>February 04, 2026</strong> - System Health Monitoring,
                Archive Management & Dark Mode Enhancements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4">
              {/* Security Changes - Red */}
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🔒 Security Changes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Updated core dependencies: @neondatabase/serverless v0.10→v1.0, @vitejs/plugin-react v4→v5</li>
                  <li>• Updated 30+ minor dependencies including Radix UI components, TanStack Query, and Tailwind plugins</li>
                  <li>• Fixed HMR WebSocket configuration preventing invalid URL exposure in browser console</li>
                </ul>
              </div>

              {/* New Features - Green */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                  🆕 New Features
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>System Health Monitoring Dashboard</strong> - Comprehensive multi-tab health monitoring with 10 specialized categories: Database Health, Email System, Integration Health, Security Metrics, Background Services, Storage, Performance, Archive Validation, and Data Sync</li>
                  <li>• <strong>Archive Management System</strong> - Soft-delete architecture for Users, Projects, and Customers with full data preservation, restore capability, and permanent deletion</li>
                  <li>• <strong>Data Sync Configuration</strong> - System to categorize 118 database tables into Always Sync/Conditional Sync/Never Sync for deployment synchronization</li>
                  <li>• <strong>Help & Support Dialog</strong> - New options to email support or submit feature requests via dialog</li>
                </ul>
              </div>

              {/* Improvements - Blue */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  🔧 Improvements
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• <strong>Dark Mode Charts</strong> - Added comprehensive dark mode support to dashboard charts and widgets using theme-aware colors via useChartTheme hook</li>
                  <li>• <strong>System Health UI Polish</strong> - Metric cards updated to AI Assessments design style, watermark icons, sorting for database health tables, memory usage explanations</li>
                  <li>• <strong>UI/UX Enhancements</strong> - Button styling consistency, icon improvements, badge color updates, customer portal icon link</li>
                  <li>• <strong>Sidebar Navigation</strong> - Fixed navigation to correctly open tab menu items, reordered archive tabs</li>
                </ul>
              </div>

              {/* Fixes - Orange */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
                  🐛 Fixes
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Fixed infinite loop in archive pages and tab synchronization logic</li>
                  <li>• Fixed archive validation that incorrectly flagged fields as missing</li>
                  <li>• Corrected database column names for session and email status checks</li>
                  <li>• Fixed data size formatting in database health display</li>
                  <li>• Added missing fields to customers archive table</li>
                  <li>• Updated user lookup to include active users for archive display</li>
                  <li>• Fixed toast notifications on archive pages</li>
                </ul>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.20 */}
        <AccordionItem
          value="v0.5.20"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.20
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>January 27, 2026</strong> - Dashboard Enhancements
                & AI Provider Integration
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Custom Dashboard Widgets
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added 3 new custom widgets to the Dashboard Builder: 
                  Account Metrics (customer statistics and trends), 
                  Project Schedules (timeline and deadline tracking), 
                  and Status Distribution (project status visualization 
                  with charts).
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: AI Providers Integration
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New AI Providers configuration in the Integrations 
                  section, enabling admin-managed multi-provider LLM 
                  integration support within the Configuration area.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Account Portal Overview Dashboard
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Created new Account Portal Overview dashboard 
                  connecting to the Dashboard Builder system, providing 
                  customers with personalized dashboard views and metrics.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Navigation Structure Updates
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated navigation with Account Management section, 
                  System Settings tab (fiscal-calendar, email-settings), 
                  and restructured Integrations with Salesforce sub-tabs 
                  and AI Providers.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Dashboard & Styling Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Various UI/UX improvements across the dashboard system 
                  including enhanced widget rendering, improved styling 
                  consistency, and better user experience patterns.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.10 */}
        <AccordionItem
          value="v0.5.10"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.10
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>January 12, 2026</strong> - Multi-Profile
                Infrastructure Intelligence & Toast Notification System
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Multi-Profile Infrastructure Intelligence
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New system for capturing deep technical infrastructure 
                  data across multiple customer environments. Features 
                  8 color-coded accordion categories (Identity, Endpoint, 
                  Network, Storage, Application, Security, Operations, 
                  Cloud), multi-profile management, and seamless profile 
                  switching within the Infrastructure Discovery drawer.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Toast Notification System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Standardized semantic variants (success, error, warning, 
                  info, confirm, loading) with automatic icons and 
                  auto-dismiss durations. Migrated 60+ files to semantic 
                  variants for consistent UX across the application.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Code & Scripts Page
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New artifact type for capturing code snippets and scripts 
                  as part of project artifacts. Enables teams to document 
                  and share technical implementations discovered during 
                  validation projects.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Rebuilt Account Portal
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Complete UI/UX refresh of the Account Portal with 
                  improved navigation, modernized components, and 
                  enhanced user experience for account management.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Infrastructure Discovery UI Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added left accent bar hover effect to accordion categories 
                  using Tailwind group and data-state for proper state sync 
                  with Radix accordion. 8 color-coded categories with 
                  consistent visual hierarchy.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Version Update Guide
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New documentation describing the complete version update 
                  process, files, logic, and checklist for streamlined 
                  future version updates.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.5.00 */}
        <AccordionItem
          value="v0.5.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.5.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>December 21, 2025</strong> - Guided Project
                Form & UI/UX Library Expansion
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Guided Project Form
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Accordion-style Create/Edit Project form with 8
                  numbered sections, color-coded steps, section
                  completion tracking (e.g., "5/8"), and
                  QuickJumpDropdown navigation. All sections start
                  collapsed by default and can be open
                  simultaneously. Template section uses "plain"
                  variant in create mode only.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Project Navigator Drawer
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New sliding drawer for browsing and filtering all
                  projects without leaving the edit page. Features
                  ACV value display with currency parsing, sorting,
                  and seamless project switching functionality.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: UI/UX Library Expansion
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enhanced UI Showcase with 6 new interactive
                  sections (13 total, 50+ demos): Cursor Effects,
                  Spring Physics, Staggered Animations, Command
                  Palette (⌘K keyboard shortcut), 3D Card Flips, and
                  Scroll-Triggered Reveal animations.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  GuidedOverviewBanner
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Project metadata banner with live progress display
                  and inline editable fields (Tech Risk, MGMT
                  Ranking, Status) in edit mode with local state for
                  immediate feedback and rollback on mutation error.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  3rd-Tier Sidebar Navigation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Restored nested submenu for UI | UX Library with
                  expandable accordion containing UI Showcase and
                  Toast Showcase items.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Audit History Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added audit history button with status display and
                  count on individual project details. Prevented
                  accidental form submission when viewing audit
                  history.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Form Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Improved customer selections, validation criteria
                  icons, project template display, primary engineer
                  display improvements, and creator tracking for new
                  projects.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.90 */}
        <AccordionItem
          value="v0.4.90"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.90
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>December 16, 2025</strong> - Outcome
                Intelligence & Account Portal Modernization
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Outcome Intelligence System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Project Closure Outcome & Intelligence System
                  (PCOS) captures technical intelligence when
                  projects close. Features Moneyball metrics
                  (Technical Fit Score, Political Alignment Score,
                  Pain Rating), configurable capture logic modes,
                  reason codes, competitor tracking, gap linkage,
                  and analytics dashboard with Quadrant Analysis and
                  Pain Index distribution.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Account Portal Redesign
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Modernized Account Portal UI with collapsible
                  card-based design for account creation. Updated
                  terminology from "Customer Portal" to "Account
                  Portal" throughout the application for consistency
                  and clarity.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Create User Dialog Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Redesigned user creation form with 4-step wizard
                  interface featuring color-coded sections, step
                  validation, visual hierarchy, solution icons, and
                  enhanced selection logic with exclusive "None" and
                  "All" options for Solutions and Stakeholder Types.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Header Button Controls
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added "Create Account" and "Create User" buttons
                  to the header bar when viewing the Team/Accounts
                  tabs. Implemented event-driven architecture for
                  seamless cross-component communication and form
                  triggering from header controls.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  New Documentation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added outcome-intelligence-system.md for Project
                  Closure Outcome system and gap-analysis-system.md
                  for Gap Analysis feature documentation. Updated
                  API reference documentation with new endpoints.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.80 */}
        <AccordionItem
          value="v0.4.80"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.80
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>December 9, 2025</strong> - Gap Analysis
                System & User Experience Enhancements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-4">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  NEW: Gap Analysis System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive system for identifying, tracking,
                  and managing solution limitations discovered
                  during technical validation projects. Features gap
                  types (Feature, Integration, Performance,
                  Scalability, Documentation), MoSCoW criticality
                  ratings, workaround tracking, cross-project gap
                  linking, and customer rollup for Product
                  Management visibility.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Audit History Drawer
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New sliding drawer component for viewing project
                  audit history without leaving the current page.
                  Provides comprehensive audit trail visibility with
                  context-preserving navigation pattern.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Reusable Confirmation Dialogs
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented centralized ConfirmationDialog
                  component for all destructive actions with red
                  Siren icon, "destructive" variant for deletions,
                  "warning" variant for other confirmations, and
                  full dark mode support.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Unsaved Changes Protection
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added confirmation prompts before discarding
                  unsaved changes across forms, preventing
                  accidental data loss with user-friendly warning
                  dialogs.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Form Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated form labels and checkbox behavior for
                  better usability. Improved project form styling
                  and streamlined custom tag functionality for
                  cleaner interface.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  UI/UX Improvements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added icons to profile settings and integration
                  headings. Updated Salesforce connection text,
                  background theme selection labels, and button
                  icons for improved visual consistency.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.70 */}
        <AccordionItem
          value="v0.4.70"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.70
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>December 5, 2025</strong> - Flight Deck
                Engine Enhancements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Health Pulse Widget Expansion
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enhanced with 5-bucket project status chart
                  (Pending, Active, TCC, Closed, Stalled) using
                  stacked bar visualization. Added four new metrics:
                  Pipeline Value (ACV sum), Win Rate (Closed Won %),
                  Workload Indicator, and Deal Urgency badges.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Risk Radar Technical Risk Chart
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New visual distribution chart showing
                  Red/Yellow/Green risk levels as mini horizontal
                  bar with proportional segments and counts.
                  Provides immediate portfolio risk visibility at a
                  glance.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Widget Settings UI Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added emerald green icons to all Flight Deck
                  widget settings for improved visual organization.
                  Icons include BarChart3, Heart, Zap, DollarSign,
                  Trophy, Briefcase, ShieldAlert, CalendarClock,
                  ClipboardCheck, and PieChart.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Weekly Scenario Support
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New Flight Deck display scenario allowing
                  configuration of specific weekdays (Monday-Friday)
                  when welcome modal appears. Requires at least 1
                  day selection with validation.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Accessibility Improvements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Fixed aria-hidden warnings with onOpenAutoFocus
                  handler in Sheet component for proper focus
                  management when opening widget settings inside
                  Dialog.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.60 */}
        <AccordionItem
          value="v0.4.60"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.60
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>December 1, 2025</strong> - Global Search
                Expansion
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Global Search Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Expanded Global Search to include documentation
                  articles, navigation pages, Getting Started
                  guides, and About page sections. Users can now
                  quickly find any page, document, or guide directly
                  from the command palette (Ctrl/Cmd+K).
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Navigation Page Search
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added 11 main menu items (Dashboard, Projects,
                  Customers, Analytics, MAP, Communications,
                  Artifacts, Configuration, About, Getting Started)
                  to search results with role-based visibility
                  matching sidebar permissions. Navigation items
                  receive +10 score boost for quick access.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Documentation Search
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Indexed 25+ technical documentation articles
                  organized by category (Project & Architecture,
                  Development & Components, Integrations, Security,
                  Database & Operations, Performance, Deployment).
                  Documentation only visible to internal roles for
                  security.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Getting Started Guides Search
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added CriteriaIQ Workspace Guide and Introduction
                  & Overview to search with keyword matching for
                  "help", "guide", "tutorial". Guides receive +5
                  score boost for help content priority.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Search UI Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added new icons (Home for navigation pages,
                  BookOpen for guides) and color coding (Indigo for
                  pages, Teal for guides). Results grouped by type
                  with internationalized labels across all 6
                  supported languages.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.50 */}
        <AccordionItem
          value="v0.4.50"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.50
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>November 28, 2025</strong> - Project Board,
                Webhook System & Salesforce Integration
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Project Board Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enhanced kanban-style project visualization with
                  drag-and-drop functionality and real-time status
                  updates across all project cards. Optimized card
                  layouts and filtering capabilities for better
                  project management workflows.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Webhook System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive outbound webhook system supporting
                  Microsoft Teams, Slack, and generic HTTP
                  endpoints. Features HMAC-SHA256 signing for
                  security, AES-256-GCM encryption, Handlebars
                  templating for dynamic payloads, exponential
                  backoff retry logic, and integration with 65+
                  Email Automation triggers.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Salesforce Field Mapping System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive bidirectional sync between
                  CriteriaIQ entities (Projects, Customers, Users)
                  and Salesforce objects (Opportunities, Accounts,
                  Contacts). Admin-configurable field mappings,
                  three sync modes (Manual, Event-driven,
                  Scheduled), value translation, conflict resolution
                  with user notifications, and broken link
                  detection.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Salesforce Configuration UI
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  New Configuration → Salesforce tab with
                  Credentials, Field Mappings, and Sync Policies
                  subtabs. Enhanced record linkage modal with Name +
                  Account filter displaying
                  Account/Owner/Stage/Amount context for accurate
                  linking.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Documentation Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added comprehensive Webhook Reference and
                  Salesforce System documentation to About →
                  Documentation page. Created new "Integrations"
                  documentation category for external system
                  integrations.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.4.00 */}
        <AccordionItem
          value="v0.4.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.4.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>November 19, 2025</strong> - Success
                Criteria & All Solutions Architecture Refactor
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  All Solutions Architecture Refactor
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Replaced implicit empty/null solutionIds pattern
                  with explicit `isAllSolutions` boolean flag across
                  all entity tables (Solutions, Components,
                  Criteria, Expected Outcomes, Actions). Updated
                  database schema, storage layer, API routes, and
                  validation logic. Enhanced admin UI with "All
                  Solutions" checkbox and badge displays for clear
                  universal entity identification.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Success Criteria System Redesign
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Redesigned from hierarchical dropdowns to
                  independent, solution-scoped searchable dropdowns.
                  Each dropdown (Component, Criteria, Expected
                  Outcome, Actions) now operates independently using
                  lookup map pattern with debounced search for
                  optimal performance with large datasets.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Show Hidden Functionality
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented per-field "Show Hidden" checkboxes to
                  toggle visibility of N/A entities (not aligned to
                  specific solutions). N/A entities displayed with
                  "(N/A)" prefix in bold font. Auto-detection
                  feature automatically checks "Show Hidden" when
                  validation templates are applied with N/A
                  entities.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  SearchableSelect Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added `useDeferredValue` for debounced search
                  performance optimization. Implemented consistent
                  h-10 height to match standard Select components.
                  Capitalized all placeholder text (Search
                  Components, Search Criteria, Search Outcomes,
                  Search Actions) for visual consistency.
                </p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Perfect Dropdown Alignment
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Achieved perfect vertical alignment across all six
                  fields (Solution, Component, Criteria, Expected
                  Outcome, Actions, Status) using unified structure
                  with min-h-[28px] and flex items-center
                  justify-between layout. Compact design optimized
                  for adding many criteria entries efficiently.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.3.40 */}
        <AccordionItem
          value="v0.3.40"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.3.40
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 31, 2025</strong> - MAP User
                Assignments Filter Enhancement
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Single-Row Filter Layout
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Consolidated 4 filter dropdowns from 2 rows into a
                  single row in MapAssignmentDialog for cleaner
                  interface design and optimal screen space
                  utilization.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Filter Reordering
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Reordered filters to logical flow: Assignments →
                  Elements → Phases → Steps, providing intuitive
                  hierarchical navigation aligned with user
                  workflow.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Dynamic Count Display
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added live count indicators showing "All {"#"}{" "}
                  Phases" and "All {"#"} Steps" using phases.length
                  and availableSteps.length for real-time visibility
                  into available filter options.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Hierarchical Filtering Preservation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Maintained existing Phase → Steps → Tasks
                  hierarchical filtering functionality with
                  automatic step filter reset on phase changes to
                  prevent stale selections.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.3.30 */}
        <AccordionItem
          value="v0.3.30"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.3.30
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 16, 2025</strong> - MAP Automation
                UI Enhancements
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Button Layout Optimization
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Repositioned Reset/Save Changes buttons to
                  top-right corner in MapAutomationTab using flex
                  layout for consistent header alignment and
                  improved visual hierarchy in the MAP automation
                  interface.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Icon-Only Global Settings
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Converted Global Settings button to icon-only with
                  "Go to Global Settings" hover tooltip in
                  MapProjectAutomationTab for cleaner UI and reduced
                  visual clutter.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Accordion Functionality
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added expand/collapse accordion buttons to
                  Auto-Completion Rules and Cascading Status Rules
                  cards (both open by default) for improved content
                  organization and focused viewing capabilities.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.3.20 */}
        <AccordionItem
          value="v0.3.20"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.3.20
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 10, 2025</strong> - Toast Showcase
                Integration
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Toast Showcase Tab Integration
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented Toast Showcase tab as final tab in
                  About page navigation (after Language
                  Translation), enabling inline display without page
                  navigation for streamlined user experience and
                  interactive toast demonstration.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Component Architecture Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Created dedicated ToastShowcaseTab component
                  (`client/src/components/toast-showcase-tab.tsx`)
                  to resolve React hooks violation by properly
                  utilizing hooks at component top level instead of
                  within render functions.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Navigation Routing Update
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated all toast-related navigation to use
                  `/about?tab=toast-showcase` route, ensuring
                  consistent deep-linking and tab activation across
                  sidebar submenu and documentation links.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Icon Consistency Implementation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Achieved icon standardization across all
                  toast-related items using MessageSquarePlus icon
                  for documentation, tab menu, and sidebar submenu
                  for improved visual consistency.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.3.10 */}
        <AccordionItem
          value="v0.3.10"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.3.10
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 4, 2025</strong> - CSS & UI
                Standardization
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-cyan-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Sidebar Collapse/Expand Button
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added collapsible sidebar functionality with
                  dedicated toggle button featuring
                  ChevronLeft/ChevronRight icons. Button styling
                  updated with consistent hover states
                  (hover:bg-gray-200 dark:hover:bg-gray-700) and
                  improved visual feedback. Sidebar state persists
                  across navigation for enhanced user experience.
                </p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Sidebar Submenu Active States
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Fixed sidebar submenu active states by adding
                  `:not(.bg-blue-100)` exclusion to CSS rules (lines
                  2032-2033, 2041-2042 in index.css) preventing
                  transparent background override conflicts. All
                  submenu sections now display prominent blue
                  backgrounds when active with proper font-semibold
                  styling.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Header Button Standardization
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Standardized all header buttons to use primary
                  button styling system, removing hardcoded color
                  values (#2d6ee6) from page-layout.tsx and using
                  `bg-primary hover:bg-blue-800` classes for
                  consistent appearance across all pages.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Body Overflow Fix
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Resolved unwanted second scrollbar issue by adding
                  `overflow: hidden` to body element in index.css.
                  PageLayout component's inner div with
                  `overflow-y-auto` now exclusively handles page
                  scrolling while preventing body-level overflow.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  CSS Architecture Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Improved CSS specificity patterns with `nav
                  button[data-state]` rules now excluding active
                  state classes to prevent override conflicts. This
                  ensures sidebar navigation active states work
                  correctly without interference from global button
                  styles.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.3.00 */}
        <AccordionItem
          value="v0.3.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.3.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>October 1, 2025</strong> - Icon Picker
                System, MAP Foundation, Success Criteria Management,
                and Rich Text Editing
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Reusable Icon Picker System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented comprehensive Lucide icon picker
                  component with 1,400+ searchable icons, real-time
                  filtering, and proper Radix UI portal patterns.
                  Applied across MAP templates,
                  tags, and other customizable entities with
                  DynamicIcon utility for rendering icons by name
                  string.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Mutual Action Plan (MAP) System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive MAP feature with database foundation
                  including 10 specialized tables (templates,
                  phases, steps, tasks, assignments, links, activity
                  tracking). Automatic server startup initialization
                  creating default 5-phase technical validation
                  template with 15 structured steps and complete
                  CRUD operations foundation.
                </p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Success Criteria Inactive State
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented comprehensive Success Criteria
                  inactive state system with database persistence,
                  proper frontend state mapping, and filtered
                  display in project details. Active/inactive toggle
                  preserves user selections, and counts exclude
                  inactive items for accurate reporting.
                </p>
              </div>
              <div className="border-l-4 border-pink-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Rich Text Notes Integration
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Integrated Tiptap (the rich-text editor) for Project Notes field with
                  Compact toolbar configuration (no image
                  insertion), enabling rich text formatting
                  including bold, italic, text highlighting, colors,
                  lists, and links with vertical expansion from
                  120px to 600px.
                </p>
              </div>
              <div className="border-l-4 border-indigo-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Documentation Consolidation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Merged duplicate architecture docs into single
                  source of truth, adding comprehensive UI/UX Design
                  Standards and Key Features & Capabilities sections
                  for improved developer guidance and system
                  documentation.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.2.20 */}
        <AccordionItem
          value="v0.2.20"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.2.20
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>September 20, 2025</strong> - Support &
                Feature Request Management Enhancement
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Support & Features Dialog Enhancement
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enhanced Support & Features dialog with improved
                  title from "Request Management" to "Support and
                  Feature Request Management" for clearer
                  functionality description.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Application Page Field Mapping
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Implemented user-friendly field mapping for
                  Application Page display, showing descriptive
                  names like "Customer Portal" instead of internal
                  IDs for improved readability.
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Version Management Centralization
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Centralized application version management through
                  version.json with robust fallback systems ensuring
                  consistent version display across all components.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.2.10 */}
        <AccordionItem
          value="v0.2.10"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.2.10
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>September 2025</strong> - Compliance &
                Regulations Management System
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Compliance Management System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive compliance regulations management
                  with enhanced field structure, full CRUD
                  functionality, and CSV import/export capabilities
                  with proper database integration.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  UI Consistency Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Consistent EarthLock iconography throughout the
                  compliance interface with improved Industry and
                  Objective column display with sortable
                  functionality.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.2.00 */}
        <AccordionItem
          value="v0.2.00"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.2.00
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>August 2025</strong> - Dynamic Solution Icon
                Management
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Solution Icon System
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive solution icon management with
                  filesystem integration reading from
                  attached_assets/solution_icons/ directory with
                  dynamic API endpoint and automatic database
                  synchronization.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Backend Storage Enhancements
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Backend storage layer fixes ensuring proper
                  solutionIcon field persistence across create and
                  update operations.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* v0.1.90 */}
        <AccordionItem
          value="v0.1.90"
          className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Version 0.1.90
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>August 2025</strong> - Multi-Factor
                Authentication System
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  MFA Implementation
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Complete Multi-Factor Authentication
                  infrastructure with TOTP, WebAuthn passkeys,
                  recovery codes, security health tracking, and
                  advanced admin management interfaces.
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Security Journey Integration
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  SecurityShieldButton component with visual journey
                  workflow guiding users through security enrollment
                  process with proper state tracking and user
                  experience optimization.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
