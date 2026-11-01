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

- Keep portal demo state in a shared in-memory React provider; this allows client and admin views to reflect the same changes without implying persistent storage or real authentication.
- Put reusable portal workflows in focused components and keep route files as typed page entry points, so client and admin records share filtering and financial presentation.
