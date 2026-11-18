# Value Journey

The value journey is the short list of stages every validation project moves
through (by default Plan, Build, Validate, Decide, Handoff). It lives inside
the Mutual Action Plan: each MAP phase is tagged with a stage, and the
success criteria are tested in MAP phases. There is no separate lifecycle to
keep up to date; a stage is done when the plan work in it is done.

Code:

- `shared/value-journey.ts`: Zod schemas, `computeJourney`, the agreement
  snapshot and comparison (`agreementSnapshot`, `changesSinceAgreement`,
  `agreementStatus`) and `DEFAULT_JOURNEY_STAGES`.
- `shared/schema/map.ts`: `journey_stages`; `stage_id` on `map_phases` and
  `map_template_phases`.
- `shared/schema/products.ts`: `priority` and `map_phase_id` on
  `success_criteria`, `map_task_criteria`, `criteria_agreements`.
- `shared/schema/projects.ts`: `project_handoff_contacts`.
- `server/storage/value-journey.ts` (`ValueJourneyStorageMixin`) and
  `server/routes/value-journey-routes.ts`.
- `client/src/components/value-journey/`: the hooks
  (`use-value-journey.ts`), the stage track, the agreement bar and dialogs,
  the priority icon, the plan line under a criterion, the MAP drawer pieces
  (`map-journey.tsx`), the admin stage list, the handoff team card and the
  after-action review card.
- `client/src/components/customer-workspace/ValueJourneyCard.tsx`: the
  Overview card.

## Stages (Template Management › Value Journey)

`/templates?tab=value-journey`, next to MAP Library. Section permission
`template_management.value-journey` (edit to change). An ordered list:
name, description (customers see it), icon, color, and at most one stage
marked "Criteria must be agreed before" (the agreement gate). Each row shows
how many MAP templates and phases use the stage. Deleting a stage leaves its
phases untagged, so they drop off the journey.

A new install seeds the five default stages (`seedDefaultJourneyStages`,
only when the table is empty). The default MAP template's phases are tagged
in order when the template is created or rebuilt and none is tagged yet.

## How a project's journey is worked out

`GET /api/projects/:id/journey` returns `computeJourney` over the project's
MAP phases, criteria and task counts, plus the agreement summary:

- Phases are grouped under their stage. An untagged phase joins the stage of
  the phase before it. A plan with no tagged phase takes the stages in order,
  one per phase (later phases join the last stage), so every plan shows the
  journey's own icons and colors. Only when no stages are set up does the
  journey show one step per phase.
- Demo Quick plans (one phase) are tagged with the third stage (Validate in
  the default list).
- Stages no phase uses are left out for that project.
- A stage is **done** when every phase in it is complete or cancelled and
  every must-have tested in it is met. The first stage not done is
  **current**.
- A project with no MAP has no journey: staff see a note, customers see
  nothing.

Where the journey shows: the Overview card (stage track, the picked stage's
phases, tasks and criteria, and tiles for must-haves met, all criteria met
and plan tasks done), the compact stage track on Manage Projects and
Dashboard project cards, the stage icons on Account Portal project cards,
and the banner on Edit Project. The banner uses the same round stage icons as
the portal (stage color for done and current stages, gray for stages not
started, a small check on done ones), with each stage's name and its
"Done Nov 3" / "Due Dec 14" line; hovering a stage shows its state and the
description set at Template Management › Value Journey. The agreement shows
as a diamond just before the gate stage.

## Success criteria

- **Priority.** Each criterion is a must-have or a nice-to-have, shown as
  an icon to the right of Status (shield for must-have, dashed circle for
  nice-to-have). Editors click it to switch. New criteria default to
  must-have.
- **Plan line.** Under each criterion: the MAP phase that tests it (editors
  pick it), how many tasks prove it, and a flag when it changed or was added
  after the customer agreed.
- `PATCH /api/success-criteria/:id` takes `priority` and `mapPhaseId` (the
  phase must be in the same project).

## Customer agreement

Customers agree to the criteria before the validation starts:

1. Staff with edit access click **Send for agreement** on the Success
   Criteria tab and pick the customer users
   (`POST .../criteria-agreement/request`). The customers get a
   `criteria_agreement_requested` notification that opens the agree dialog.
2. A customer user reviews the must-haves and nice-to-haves, enters their
   name and title, ticks the box and clicks **I agree**
   (`POST .../criteria-agreement/agree`, external roles only). The name,
   title, date and time and a frozen copy of the criteria are saved, and
   the project team gets a `criteria_agreed` notification. "Suggest a
   change" opens the project's Messages instead.
3. If a criterion's wording, expected outcome or priority changes, or one is
   added or removed, the bar turns amber and lists the rows. Staff click
   **Ask to agree again**; the history keeps every request and agreement.

The gate is soft: the journey and the bar warn while the agreement is
missing, but MAP work is never blocked.

## MAP drawer

The drawer layout is unchanged. Additions:

- A stage chip on each phase card in the stepper and on phase rows.
- "N of M must-haves met" on phase cards.
- `#N` chips on task rows for the criteria the task proves.
- In the detail pane: a **Journey stage** picker for a phase
  (`PUT /api/map/phases/:id { stageId }`) and **Proves these criteria** for a
  task, with a picker to link more (`PUT /api/map/tasks/:id/criteria`). A
  linked criterion with no phase takes the task's phase.
- The MAP template editor has a stage picker per phase; applying a template
  copies the stages to the project's phases.

## After the sale

CriteriaIQ is not used for implementation work after the sale. It keeps:

- **Handoff team** (Overview, staff only): the Pro Services people who take
  the customer over, each with a responsibility
  (`GET`/`PUT /api/projects/:id/handoff-team`, up to 10, staff users only;
  ProServ users are listed first).
- **After-action review** (Overview, staff only, closed projects): must-haves
  and nice-to-haves met, how many criteria changed after sign-off, who
  agreed and when, and **Start review**, which records the win/loss outcome
  (see [outcome-intelligence-system.md](outcome-intelligence-system.md)).

## Demo Mode

The seed tags the demo MAP phases with stages in order, makes the last third
of each project's criteria nice-to-haves, places criteria in the plan and
links them to tasks, records agreements by stage (early projects: sent and
waiting; mid: agreed then changed; later: agreed), and gives won projects a
handoff team from the two demo ProServ users.
