@AGENTS.md

## Screenshots of changes

Any change that affects what the app looks like or how a screen behaves needs screenshots, so the user can see what changed.

- Save them in `docs/screenshots/`, in one subfolder per view, for example `docs/screenshots/library/`, `docs/screenshots/song-screen/`, `docs/screenshots/chord-view/`. Use a short kebab-case name for the view.
- Reuse the view's subfolder if it exists. When a change adds a new type of view (a new screen, sheet, dialog or popover), create a new subfolder for it. Never put screenshots loose in `docs/screenshots/`.
- Take them from the running app (`npm run dev`, then the `run` skill), not mockups. Capture the app at phone size, as the phone frame shows it.
- Capture the screen after the change. If the screen already existed, also capture it before, so the difference is visible.
- Name files `<change>-before.png` and `<change>-after.png`, for example `docs/screenshots/tab-view/playhead-before.png`. Use a short kebab-case change name.
- Commit the screenshots with the change they show.
- Skip screenshots for changes with no visible effect (docs, refactors, tests, config), and say in your summary that you skipped them.
- If the app can't be run to capture them, say so in your summary instead of leaving them out silently.
- `docs/design/screens/` holds the original design reference. Don't add change screenshots there.
