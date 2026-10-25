# AI usage and Devin

This page says plainly how AI was used to build LightLink, and where Devin was and was not used.

## What was built with AI
LightLink was built during Devin Hacks Kochi (24 to 25 October 2026) by one developer, Ryyan Safar, directing AI coding agents.

- **Idea selection:** several model-written ideas per hackathon track were scored by blind model judges (three judges, shuffled, track labels removed). LightLink won that round. The author made the final call.
- **Code:** the fountain-code codec, the web app screens, the service worker, the tests and the documentation were written by AI coding agents (Anthropic Claude, run through Claude Code) under the author's direction and review.
- **Review:** further model judges (Fable and Opus class models) scored the project blind. Their findings (for example: the progress bar looked broken, the Auto toggle did nothing, no real-camera test) drove fixes that are in the git history.
- **The author:** chose the idea, set the constraints (software only, works offline, explainable in 30 seconds), tested on the real site and phones, and decided what to ship and what to hold back.

## Where Devin was used
**Not used to write or review LightLink.** The Devin cloud account hit an `out_of_quota` billing error (HTTP 403) during the hackathon, so no Devin session, pull request or commit exists in this repository. Nothing here is labelled as Devin's work, because none of it is.

Devin was used in the author's other hackathon project, the offline ledger repository `ryyansafar/stillcounts`, before that error: 9 sessions and 5 merged pull requests (hostile-scenario scouts, a chaos test harness, a learning layer, a race game and a browser QA run), with an honest account of what needed human rework in that repository's `docs/devin.md`.

If Devin sessions become available after this was written, they will be listed here with their pull request links.

## Things not claimed
- No real-phone-camera throughput has been measured; the numbers in the README are from a synthetic camera in a browser test.
- The technique (animated QR fountain codes) is not new; see the Prior art section of the README.

## Links
- Portfolio: https://ryyansafar.site
- GitHub: https://github.com/ryyansafar
- Buy Me a Coffee: https://buymeacoffee.com/ryyansafar
- PayPal: https://www.paypal.com/paypalme/ryyansafar
- Razorpay: https://razorpay.me/@ryyansafar
