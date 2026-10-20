# FoundIt! Campus

A responsive, front-end lost-and-found prototype for college campuses. Built with plain HTML, CSS and vanilla JavaScript. No framework, server, account system or external service is required.

## Run the project

1. Keep `index.html`, `style.css` and `script.js` in the same folder.
2. Open `index.html` in a modern browser, or open the folder in your editor/builder and use its preview feature.
3. The first load seeds clearly fictional sample reports. Use **Remove sample reports** to remove only those examples; reports you create are kept.
4. Browser storage must be enabled for reports and theme preference to persist.

Some browser configurations restrict `localStorage` for pages opened directly as `file://`. If saving does not work, use your editor's local preview/server. No package install is needed.

## Main features

- Browse, search and filter lost/found reports by type, category, location and status.
- Create reports with validation and a review-before-publishing preview.
- Optional image upload, restricted to JPG/PNG/WEBP/GIF and 2 MB or less. Images are resized and compressed where the browser supports it.
- Rule-based potential-match suggestions with a score and human-readable matching clues.
- Mark reports resolved, restore them, and delete them after confirmation.
- Local browser persistence and light/dark theme preference.
- Responsive navigation, keyboard-friendly controls, visible labels, focus styles and reduced-motion support.

## Matching algorithm

The matching function compares each open Lost report with each open Found report. It never compares a report to itself or pairs two reports of the same type. Each clue is normalized to lowercase and collapsed whitespace before comparison.

Default weights are defined near the top of `script.js`:

```js
const MATCH_WEIGHTS = { category: 35, colour: 25, location: 25, date: 15 };
const MAX_DATE_GAP_DAYS = 14;
```

- **Category:** 35 points when both values are present and equal.
- **Colour:** up to 25 points when both values are present and equal or one contains the other after normalization.
- **Location:** 25 points for the same location, or 60% of that weight for a nearby pair in the editable `areNearby()` map.
- **Date:** up to 15 points for reports on the same day, decreasing as the gap approaches 14 days. Dates more than 14 days apart receive no date points.

Missing details earn no points. Scores are bounded to 100. Only pairs with a score above zero are shown, and the highest-scoring six are displayed. These are rule-based suggestions, not AI predictions or confirmed matches. Adjust the weights and nearby-location map to suit a particular campus.

## Data and privacy limitations

- Reports, private notes, sample status and uploaded image data are stored in the current browser's `localStorage`. The app does not send reports anywhere.
- Data is not shared with other students, browsers or devices. Clearing browser storage can erase reports.
- Local storage has limited capacity. Photos are resized where feasible, but a storage quota error can still occur. The app shows an error instead of silently claiming a report was saved.
- Private identifying details are not shown on public report cards. They are visible in the detail view on this same browser, so this is not a secure vault. Do not enter passwords, student IDs, phone numbers or email addresses.
- Do not upload photos of student IDs or documents containing sensitive information. Avoid publishing unique identifiers for valuable or sensitive items.
- The prototype is not monitored by college staff. For a potential match, verify ownership privately through an appropriate college channel. Do not rely on the match score as proof.

## Suggested manual test checklist

- [ ] Open the app in a clean browser profile and confirm fictional samples appear.
- [ ] Create a Lost report and a Found report with matching category, colour, location and date; check that a potential match appears with an explanation.
- [ ] Remove one matching clue and observe the score/explanation change.
- [ ] Try submitting with required fields blank and with a future date.
- [ ] Try uploading a non-image and an image larger than 2 MB; confirm helpful errors.
- [ ] Search by item name, description and location. Try each report type, category, location and status filter.
- [ ] Resolve a report, switch to Resolved, then restore it. Confirm dashboard counts update.
- [ ] Delete a report and cancel a deletion once to confirm the confirmation works.
- [ ] Remove sample reports and verify reports you created remain.
- [ ] Toggle dark/light theme and reload the page.
- [ ] Check keyboard navigation and narrow mobile widths.

This checklist is a suggested test plan, not a claim that every scenario has been executed.
