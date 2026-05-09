# LeetCode Submission History Fixtures

Captured 2026-05-09 by author's own LC account (owner: user, captured via curl + authenticated session).

## Fixtures

| File | Source endpoint | Purpose |
|---|---|---|
| `list-many.json` | `GET /api/submissions/two-sum/?offset=20&limit=20` | 20-row submissions_dump, mixed verdicts (9 AC / 8 WA / 3 RE) |
| `list-empty.json` | `GET /api/submissions/valid-number/?offset=0&limit=20` | Empty `submissions_dump: []` |
| `list-session-expired.json` | `GET /api/submissions/two-sum/` with no auth cookies | JSON 401 `{"detail": "Authentication credentials were not provided."}` |
| `detail-ac.graphql.json` | `POST /graphql/` query `submissionDetails(submissionId: 1998512566)` | Accepted submission (statusCode 10) |
| `detail-wa.graphql.json` | `POST /graphql/` query `submissionDetails(submissionId: 1998497914)` | Wrong Answer submission (statusCode 11) |

## ⚠ IMPORTANT — Wire shape drift discovered during capture

**RESEARCH.md §Pattern B / §A3 assumption is OBSOLETE.** LeetCode has migrated submission-detail from server-rendered HTML (`var pageData = {...}` scrape) to a Next.js SPA backed by GraphQL. The assumptions below no longer hold:

| RESEARCH.md said | Reality (2026-05-09) |
|---|---|
| Detail via `GET /submissions/detail/{id}/` returning HTML with `var pageData = {...};` | Detail via `POST /graphql/` operation `submissionDetails` returning clean JSON. The HTML route is now a static Next.js shell. |
| Session-expired = HTML login-redirect with `<title>Log In` | Session-expired = HTTP 401 JSON `{"detail": "Authentication credentials were not provided."}`. |
| HTML scrape regex needed | No HTML scrape — GraphQL returns structured JSON. |

Plan 04-03's `submissionHistoryClient` MUST be replanned against GraphQL before implementation. See `04-01-SUMMARY.md` for the remediation path.

## GraphQL query used for detail fixtures

```graphql
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtime runtimeDisplay runtimePercentile
    memory memoryDisplay memoryPercentile
    code timestamp statusCode
    user { username profile { realName userAvatar } }
    lang { name verboseName }
    question { questionId titleSlug hasFrontendPreview }
    notes flagType
    topicTags { tagId slug name }
    runtimeError compileError fullCodeOutput
    testDescriptions testBodies testInfo
  }
}
```

Variables: `{ "submissionId": <int> }`. Headers: `Cookie: LEETCODE_SESSION=<jwt>; csrftoken=<hex>`, `x-csrftoken: <hex>`, `Content-Type: application/json`, `Referer: https://leetcode.com/submissions/detail/<id>/`.

## Scrubbing applied

Per T-04-01-01 all fixtures were scrubbed of:
- `LEETCODE_SESSION=<jwt>` → not present in captured fixtures (never appeared in response bodies).
- `csrftoken=<hex>` → not present.
- Real email address → not present.
- Real username `mxyzptlk13` → replaced with `testuser` in GraphQL detail fixtures.
- Real name `Mo Xu` → replaced with `Test User`.
- Avatar URL `avatar_<digits>.png` → replaced with `avatar_REDACTED.png`.

`grep -rE "mxyzptlk13|monsoon1013|Mo Xu|LEETCODE_SESSION=[a-zA-Z0-9._-]{20,}|csrftoken=[a-f0-9A-Z]{20,}" tests/fixtures/lc-submissions/` returns empty.

## Recapture procedure

Reading this after LC drifts again?

1. Read the LC session cookie from the installed plugin's `data.json` (or capture from DevTools Network tab while signed in).
2. For list fixtures: `curl https://leetcode.com/api/submissions/<slug>/?offset=0&limit=20&lastkey= -H "Cookie: LEETCODE_SESSION=<jwt>; csrftoken=<hex>" -H "x-csrftoken: <hex>" -H "Referer: https://leetcode.com/problems/<slug>/submissions/" -H "Accept: application/json"`. The trailing slash on the path matters (301 without it).
3. For detail fixtures: POST to `https://leetcode.com/graphql/` with the query above. `submissionId` must be an integer, not a string.
4. For session-expired: same list endpoint with no cookies — returns JSON 401.
5. Scrub any `username`, `realName`, `userAvatar`, or email-like strings before commit.
