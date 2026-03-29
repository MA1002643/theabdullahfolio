#!/bin/bash
# Script to create a GitHub issue for mobile navigation layout and animation update
# Usage: ./create-mobile-nav-issue.sh <repo-owner> <repo-name> <github-token>

REPO_OWNER="$1"
REPO_NAME="$2"
GITHUB_TOKEN="$3"

ISSUE_TITLE="Mobile Navigation Button Layout and Animation Update"
ISSUE_BODY="Update the navigation button layout and animation for mobile devices (screen width ≤ 479px) to match the exact positioning, spacing, and sizing as seen on [this reference website](https://next-js-creative-portfolio-website.vercel.app/):\n\n- **Left side:** 4 navigation buttons: About, Projects, Qualifications, Contact Us\n- **Right side:** 4 buttons: GitHub, My Past, LinkedIn, Resume\n- Spacing, button size, and positioning must match the reference site exactly for ≤ 479px, with no effect on ≥ 480px.\n- Animation: On first visit, icons should appear in the same sequence as the reference (two at a time), with matching speed, timing, and effect.\n\n## Acceptance Criteria\n- [ ] Navigation button layout and spacing for ≤ 479px matches the reference site\n- [ ] Button sizing and positioning do not affect ≥ 480px\n- [ ] Animation sequence, speed, and effect match the reference (two icons at a time)\n- [ ] All changes are responsive and tested on real devices/emulators\n\n## Additional Context\n- Reference site: https://next-js-creative-portfolio-website.vercel.app/\n- Assign to: @theabdullahfolio\n- Labels: navigation, mobile, UI, animation, enhancement\n"

LABELS="navigation,mobile,UI,animation,enhancement"
ASSIGNEES="theabdullahfolio"

curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/issues \
  -d "{\n    \"title\": \"$ISSUE_TITLE\",\n    \"body\": \"$ISSUE_BODY\",\n    \"labels\": [$(echo $LABELS | sed 's/,/\",\"/g;s/^/\"/;s/$/\"/')],\n    \"assignees\": [\"$ASSIGNEES\"]\n  }"

echo "\nIssue creation request sent. Check your repository for the new issue."
