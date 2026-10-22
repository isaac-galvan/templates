# Prompt Filler

A small offline web app for iPhone. Pick a saved AI prompt, fill in the blanks, and tap **Copy**. There's no backend, no build step, and no dependencies. Your templates are stored on your phone (in localStorage).

## Files
| File | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app |
| `manifest.webmanifest`, `icons/` | Home Screen / PWA metadata and icons |
| `sw.js` | Offline cache. **Bump `VERSION` when you change any file.** |
| `templates.json` | Starter templates, loaded only on first launch |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
| `tests/`, `screenshots/`, `SPEC.md` | Dev only. Not included in the zip. |

## Template syntax
| You write | You get |
|---|---|
| `{topic}` or `{{topic}}` | A text box |
| `{tone|friendly}` | A text box. If you leave it empty, `friendly` is used. |
| `{tone:formal,casual,friendly}` | A dropdown, with the first option (`formal`) preselected |
| `{tone:formal,casual,friendly|casual}` | A dropdown with `casual` preselected |
| `{style:short\, punchy,long\, detailed}` | A dropdown whose options contain commas (write `\,`) |

- Names can use letters, numbers, spaces, `_`, `-`, and `.`. Dropdown options can contain spaces.
- If the same blank appears more than once, you get one field that fills every spot. Names are not case-sensitive. If any occurrence lists options, that field is a dropdown.
- Text blanks left empty with no default stay as `{name}` in the preview, so you can spot them.
- Quoted JSON like `{"a": 1}` isn't treated as a blank.
- Text boxes accept multiple lines. The app remembers what you last picked or typed for each template.

Example:
```
Rewrite this in a {tone:formal,casual,friendly|casual} tone for {audience|my team}.

{text}
```

## Run locally
```
python3 -m http.server 8765    # then open http://localhost:8765
```
Tests (needs Chrome): `cd tests && npm i && node test.js` with the server running.

## Publish to GitHub Pages

### Option A: gh CLI
```
gh auth login                                   # once
cd prompt-filler
git init && git add . && git commit -m "Prompt Filler"
gh repo create prompt-filler --public --source=. --push
gh api -X POST repos/{owner}/prompt-filler/pages -f "source[branch]=main" -f "source[path]=/"
```
(Replace `{owner}` with your GitHub username. If your default branch is `master`, use that instead.) After a minute or so, the site is live at `https://<username>.github.io/prompt-filler/`.

Note: Pages on a free account needs a **public** repo. Your templates are not in the repo, only the examples. The templates you add stay on your phone.

### Option B: github.com in the browser (no command line)
You'll use **`prompt-filler-site.zip`**. Its files sit at the top level of the zip, not inside a folder.

1. **Unzip it.** On a Mac, double-click the zip. On Windows, right-click it and choose **Extract All**. You'll get a folder containing `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, `templates.json`, `README.md`, `.nojekyll`, and an `icons` folder.
   - `.nojekyll` is a hidden, empty file. On a Mac, press **Cmd+Shift+.** in Finder to see it. If it doesn't upload, that's OK; the app works without it.
2. **Create a repository.** Sign in at https://github.com. Click the **+** at the top right, then **New repository**.
   - Repository name: `prompt-filler`
   - Choose **Public**. Free GitHub Pages requires it. Your own templates live on your phone, not in the repo.
   - Leave the other boxes unchecked and click **Create repository**.
3. **Upload the files.** On the new repo page, click **Add file → Upload files** (or the **uploading an existing file** link).
4. Open the unzipped folder, select **everything inside it** (the files *and* the `icons` folder, but not the folder itself), and drag it onto the upload area. Wait until every file is listed, including `icons/icon-180.png`, `icons/icon-192.png`, and `icons/icon-512.png`.
5. Scroll down and click **Commit changes**.
6. **Turn on Pages.** In the repo, click **Settings**, then **Pages** in the left sidebar. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**, then click **Save**.
7. **Wait 1–3 minutes.** Refresh the Pages settings page until it says *"Your site is live at https://YOUR-USERNAME.github.io/prompt-filler/"*. (The **Actions** tab shows progress.)
8. **On your iPhone**, open that URL in **Safari**. It has to be Safari for Add to Home Screen.
9. Tap **Share** (the square with an up arrow), scroll down, tap **Add to Home Screen**, then **Add**.
10. Open **Prompts** from your Home Screen. That's the app.

**Updating later:** In the repo, use **Add file → Upload files** again and drop in the changed files. GitHub replaces files with the same name. Before uploading, bump `VERSION` in `sw.js` (for example `pf-v3`) so your phone fetches the new version.

## Add to iPhone Home Screen
1. Open the Pages URL in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open it from the Home Screen icon. It runs full-screen and works offline after the first load.

**Heads-up:** The Home Screen app keeps its own storage, separate from Safari. Add your templates inside the Home Screen app. To move them between the two, use **⋯ → Export / Share JSON** and then **Import**. Export now and then as a backup, because clearing website data deletes your templates.

## Updating the app
Edit the files, bump `VERSION` in `sw.js` (currently `pf-v2`, so the next one is `pf-v3`), and push or upload again. The phone picks up the new version the next time you open the app online.
