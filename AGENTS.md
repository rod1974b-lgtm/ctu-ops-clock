<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Keep mission deadlines and selection logic in a pure engine module; React owns commands and browser-only Worker updates so timing remains independently testable.
- Persist this device-local terminal in browser storage as explicitly requested in the blueprint; never read browser storage during SSR render.
- Use shared SVG seven-segment digits for clock readouts and semantic CSS tokens for threat palettes, keeping display geometry stable.
- Use synthesized Web Audio signals until original soundtrack/video assets are provided; audio must be unlocked by a user gesture.
