# Account Settings state migration (blocked)

This is the one form from the `refactor/app-split` branch that was not
colocated. Everything else in that branch is done and verified. This note
records exactly why, so the work can be resumed safely.

## Why it wasn't done

`AccountSettingsModal` is already extracted, but its form state still lives in
`App` because **onboarding shares the same state machine**. Moving the fields
into the modal without separating onboarding first would silently break
onboarding's name/handle fields and its submit path.

## Where the shared state is used

The six fields (`editName`, `editRole`, `editLocation`, `editBio`, `editEmail`,
`editHandle`) plus the link-drag state are touched from:

| Location (App.js) | What it does |
|---|---|
| ~9363, ~10063 | logout / guest reset |
| ~10123, ~10147, ~10181 | three profile-load branches (cloud, cache, brand-new) |
| ~10968–10994 | `handleOpenAccountSettingsModal` and `handleRevertAccountChanges` seed values |
| ~16857–16922 | **onboarding form inputs** bound directly to `editName` / `editHandle` / `editRole` / `editLocation` / `editBio` / `editEmail` |
| ~16870 | onboarding handle input, including its sanitizing onChangeText |
| ~11695–11753 | `handleFinishOnboarding` reads those fields to build the profile |
| ~11108–11120 | sticky-save visibility depends on `hasUnsavedAccountChanges()` |
| ~11801–11853 | link drag responder uses `linkDragY` / `linkRowHeightRef` / `linkDropLineInterpRef` |
| ~16930–16950 | onboarding/account JSX referencing the drag state |

There is also a handle-availability status (`handleStatus`) shared by the
onboarding and account forms.

## Status: the form state is moved

Commit `d96b716` completes this. `AccountSettingsModal` now owns
`editName`/`editRole`/`editLocation`/`editBio`/`editEmail`,
`handleSaveAccountSettings`, `handleRevertAccountChanges`,
`hasUnsavedAccountChanges`, `handleCloseAccountSettings`, and the sticky-save
animation/effect; it hydrates the fields from `userProfile` on open.

Verified against the mock: fields populate, editing reveals the sticky Save,
saving closes with "Settings Saved", closing with edits shows "Discard
Changes?", and discarding then reopening shows the saved value.

Onboarding owns `ob*` and is verified separately (fields hydrate, Finish Setup
completes).

## What is still shared, by design

- **`editHandle`** stays in `App`: the handle-availability effect observes
  `needsOnboarding ? obHandle : editHandle`, and onboarding's UI uses the same
  `handleStatus`. Separating it needs a per-form availability check.
- **`editAvatar` / `editLinks` / `editContacts` / `editContactConsent`** stay in
  `App` because the avatar picker and link editors write them; the modal reads
  them through the app bag.
- **Link-drag state** (`draggingLinkIndex`, `linkDragY`, `linkRowHeightRef`,
  `linkDropLineInterpRef`) is still shared with JSX around App.js ~16930–16950.

Those are the remaining optional colocations; none of them block anything.

## How to test it without production data

`scripts/mock-supabase.js` implements enough of GoTrue + PostgREST to boot the
app signed in. `supabase.js` reads `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` for test builds.

```bash
node scripts/mock-supabase.js 54321 &
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=mock npx expo export -p web --output-dir .build-check
```

Log in as `test@example.com` / any password. The mock profile has
`onboarding_completed: true`; start the mock with `MOCK_ONBOARDING=1` to get
`false` instead, which sends the app into the onboarding flow after login.

```bash
MOCK_ONBOARDING=1 node scripts/mock-supabase.js 54321 &
```

Verified: with that flag the app lands on "Set Up Your Profile" after login,
so onboarding can be driven headlessly for before/after comparison.

## Next change, precisely

1. Add `obName`, `obHandle`, `obRole`, `obLocation`, `obBio`, `obEmail` next to
   the `edit*` declarations, plus a one-shot seed effect from `userProfile`
   while `needsOnboarding` is true (guard with a ref so typing is never
   clobbered by a profile refresh).
2. Move the handle-availability effect (App.js ~9788–9811) below the
   `needsOnboarding` declaration and make it observe
   `needsOnboarding ? obHandle : editHandle`. It cannot stay where it is:
   putting `needsOnboarding` in its dependency array before that state is
   declared is the same TDZ crash the file already documents elsewhere.
3. Point the seven onboarding inputs (~16857–16922) and
   `handleFinishOnboarding` (~11695–11753) at the `ob*` fields. Avatar, links
   and contacts stay shared at this stage.
4. Verify with `MOCK_ONBOARDING=1`: onboarding renders, fields populate from
   the mock profile, the handle check flips invalid → available, and Finish
   Setup completes (the mock accepts the write).
5. Only then move the account fields and their handlers.

## Gates

Every change must keep all of these green:

```bash
npm run lint
npm run check:unbound
npx expo export -p web
npm run smoke
```
