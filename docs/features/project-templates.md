# Project Templates

A project template is a reusable project setup. People use one from
Library › Project Templates (**Use Template**) to start a project with its
fields, plan and validation criteria already filled in.

Code: `client/src/components/templates/ProjectTemplatesTab.tsx` (the list),
`client/src/components/templates/EditTemplate.tsx` (create, edit, duplicate),
`client/src/components/templates/project-template-from-project.ts` (Save As
Project Template), `client/src/pages/create-project.tsx`,
`server/routes/templates-routes.ts` (`/api/templates`),
`server/storage/infrastructure.ts` (project template storage), table
`project_templates` in `shared/schema/projects.ts`.

## Sections on the list

| Section | Shows |
| --- | --- |
| My Templates | Active templates you created that are not system templates. |
| Other Templates | Active non-system templates other people created. |
| System Templates | Active templates an Admin made system templates. |
| Inactive Templates | Every inactive template. |

## Save As Project Template

Tick **Save As Project Template** next to **Create Project**. After the
project is created (with its criteria, MAP and competitors), a template is
saved straight into your **My Templates**, named "<project name> Template".
A toast confirms it; if the template can't be saved, the project still
exists and a warning says so. Rename or refine it from My Templates.

What the template takes from the project:

- Type, solutions, environment and tags.
- Business problem, solution description, customer objective and policy
  considerations.
- The plan: its MAP template (optional; without one, projects start with no
  plan and add a Quick plan from the MAP drawer).
- The validation criteria rows (progress reset to Not Started) and the
  validation criteria template they came from.
- "Competing With" competitors, as the template's typical competitors.
- The duration in working days (from the source template, or start to end
  date with weekends skipped).
- Project links, and documents picked from the document library. Files
  uploaded only for this project stay with the project.

Left out on purpose, because they belong to one deal: the account,
opportunity and CRM record, dates, the project team and engineers, customer
users and access, and the project's MAP progress.

**Use Template** carries the same features back into a new project: the MAP
template, competitors, criteria, links, documents,
lifecycle and duration. The project records the template it came from
(`projects.template_id`) and the template's usage count goes up.

## Who can change a template

| Action | Who |
| --- | --- |
| Save or create a template | Any internal user. It is always theirs and never a system template, unless an Admin creates it as one. |
| Edit or delete | The creator, while it isn't a system template, or an Admin. |
| Duplicate | Anyone who can edit the template or has Edit on Library › Project Templates. The copy is the duplicator's own. |
| Make System Template / Move Out Of System Templates | Admins only (the shield button on each card, or the System switch in the editor). |

The server enforces the same rules (`templateWriteRefusal` in
`templates-routes.ts`): it sets the creator from the session, forces
`isSystem` to false for non-admins, and refuses changes to other people's
templates and to system templates. Customers, Guests and Partners can't
write templates at all.
