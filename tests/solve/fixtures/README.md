# Phase 3 Fixture Capture — D-31 Gate

## Purpose

D-31 gate: Phase 3 (run/submit) **cannot ship** without live-captured JSON fixtures
for all six verdict types + two run-response shapes, captured from the
production `leetcode.com` judge. The shapes of the responses drive every
downstream decision in Plans 04–06:

- The status-code dispatch table in `src/solve/statusMap.ts` (D-15)
- The verdict modal renderer in `src/solve/verdictModalRenderer.ts` (D-29/D-30)
- The polling terminal-state detection in `src/solve/pollingOrchestrator.ts` (D-23/D-26)
- The session-expiry dispatch inside `src/solve/leetcodeRest.ts` (D-27)

Assumptions about the judge's JSON shape without live fixtures have repeatedly
produced shipped bugs in prior LC clients (leetcode-cli, vsc-leetcode-cli).
Capturing once, testing against the captures forever is the mitigation.

## Required Fixture Files (8 total)

All filenames are EXACT. Tests import by literal path.

| File                      | Type           | LC `status_code` / state | Problem Used              |
|---------------------------|----------------|--------------------------|---------------------------|
| `accepted.json`           | submit verdict | 10 (Accepted)            | `two-sum` correct         |
| `wrong-answer.json`       | submit verdict | 11 (Wrong Answer)        | `two-sum` off-by-one      |
| `tle.json`                | submit verdict | 14 (Time Limit)          | `contains-duplicate` O(n²)|
| `mle.json`                | submit verdict | 12 (Memory Limit)        | eager `list(range(10**8))`|
| `compile-error.json`      | submit verdict | 20 (Compile Error)       | python syntax error       |
| `runtime-error.json`      | submit verdict | 15 (Runtime Error)       | python `raise IndexError`  |
| `run-sample.json`         | run response   | `state: 'SUCCESS'`       | `two-sum` sample input    |
| `run-custom.json`         | run response   | `state: 'SUCCESS'`       | `two-sum` user custom case|

## Capture Protocol (Exact Steps)

You (developer) have live LC session access; Claude (executor) does not.
Capture these 8 files manually using the protocol below.

### Setup

1. Be signed into `leetcode.com` in a browser tab that shares cookies with
   your Obsidian plugin's authenticated session.
2. Find your `LEETCODE_SESSION` and `csrftoken` values (browser DevTools →
   Application → Cookies → `leetcode.com`). These match what the plugin
   would pass in `getAuthCookies()`.

### Approach A (preferred — Obsidian devtools console)

Open Obsidian → `Cmd/Ctrl + Shift + I` → Console. For each of the 8 rows in
the table above, paste a snippet like:

```js
const r = await requestUrl({
  url: 'https://leetcode.com/problems/two-sum/submit/',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'cookie': 'csrftoken=YOUR_CSRF; LEETCODE_SESSION=YOUR_SESSION;',
    'x-csrftoken': 'YOUR_CSRF',
    'origin': 'https://leetcode.com',
    'referer': 'https://leetcode.com/problems/two-sum/description/',
    'x-requested-with': 'XMLHttpRequest',
  },
  body: JSON.stringify({
    lang: 'python3',
    question_id: '1',
    test_mode: false,
    typed_code: 'class Solution:\n    def twoSum(self, nums, target):\n        d = {}\n        for i, x in enumerate(nums):\n            if target - x in d: return [d[target-x], i]\n            d[x] = i\n        return []',
    judge_type: 'large',
  }),
  throw: false,
});
const body = r.json;               // { submission_id: 12345 }
// Poll until terminal state:
let check;
for (let i = 0; i < 30; i++) {
  check = (await requestUrl({
    url: `https://leetcode.com/submissions/detail/${body.submission_id}/check/`,
    method: 'GET',
    headers: {
      'cookie': 'csrftoken=YOUR_CSRF; LEETCODE_SESSION=YOUR_SESSION;',
      'x-csrftoken': 'YOUR_CSRF',
      'referer': 'https://leetcode.com/problems/two-sum/description/',
    },
    throw: false,
  })).json;
  if (check.state === 'SUCCESS') break;
  await new Promise(r => setTimeout(r, 2000));
}
console.log(JSON.stringify(check, null, 2));    // copy into accepted.json
```

### Approach B (script)

Alternative: hand-write a `scripts/capture-fixtures.ts` one-shot (do NOT
commit this script — it will contain your cookie in plaintext). After each
poll completes, write the final `check` JSON to the named file under
`tests/solve/fixtures/`.

### Problem-Specific Code Payloads

- **Accepted (accepted.json)** — Two Sum (`two-sum`) canonical solution:
  ```python
  class Solution:
      def twoSum(self, nums, target):
          d = {}
          for i, x in enumerate(nums):
              if target - x in d:
                  return [d[target - x], i]
              d[x] = i
          return []
  ```
- **Wrong Answer (wrong-answer.json)** — Two Sum, but `return [i, j + 1]`
  (off-by-one on the second index).
- **Time Limit Exceeded (tle.json)** — Contains Duplicate
  (`contains-duplicate`) with O(n²) brute force on a long auto-generated
  test input:
  ```python
  class Solution:
      def containsDuplicate(self, nums):
          for i in range(len(nums)):
              for j in range(i + 1, len(nums)):
                  if nums[i] == nums[j]: return True
          return False
  ```
- **Memory Limit Exceeded (mle.json)** — Any small-memory problem where you
  allocate a huge list up front:
  ```python
  class Solution:
      def containsDuplicate(self, nums):
          _wasted = list(range(10**8))
          return len(nums) != len(set(nums))
  ```
- **Compile Error (compile-error.json)** — Python unclosed brace:
  ```python
  class Solution:
      def twoSum(self, nums, target:
          return []
  ```
  (Note: LC's Python runner uses `status_code: 20` for parse / import errors
  that surface before execution. Java users can trigger with a missing `;`.)
- **Runtime Error (runtime-error.json)** — Python raises on first line:
  ```python
  class Solution:
      def twoSum(self, nums, target):
          raise IndexError('x')
  ```
- **Run Sample (run-sample.json)** — POST to `/interpret_solution/` with
  `data_input = exampleTestcases` (the string the detail cache holds for
  `two-sum`: `"[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6"`). Use the canonical
  Two Sum correct solution.
- **Run Custom (run-custom.json)** — POST to `/interpret_solution/` with
  a user-supplied test, e.g. `data_input = "[1,2,3]\n4"`. Same correct
  solution.

### Per-File Shape Checks

After capture, confirm each JSON has the expected fields:

- `accepted.json`: `status_code: 10`, `status_msg: 'Accepted'`,
  `total_correct == total_testcases`, `status_runtime`, `status_memory`,
  optionally `runtime_percentile`, `memory_percentile`.
- `wrong-answer.json`: `status_code: 11`, `status_msg: 'Wrong Answer'`,
  `input` OR `last_testcase`, `std_output` OR `code_output`,
  `expected_output` OR `expected_code_answer`.
- `tle.json`: `status_code: 14`, `status_msg: 'Time Limit Exceeded'`,
  `last_testcase` OR `input`.
- `mle.json`: `status_code: 12`, `status_msg: 'Memory Limit Exceeded'`,
  `last_testcase` OR `input`.
- `compile-error.json`: `status_code: 20`, `status_msg: 'Compile Error'`,
  non-empty `compile_error` AND/OR `full_compile_error`.
- `runtime-error.json`: `status_code: 15`, `status_msg: 'Runtime Error'`,
  non-empty `runtime_error` AND/OR `full_runtime_error`, `last_testcase`.
- `run-sample.json` / `run-custom.json`: `state: 'SUCCESS'`, `code_answer`
  (array), `correct_answer` (boolean), `expected_code_answer` (array).

## Redaction Protocol (BEFORE committing)

Captured JSON MUST NOT contain your session cookie or CSRF token.
Automated gate (verify-work): `grep -rE 'csrftoken=|LEETCODE_SESSION=|sessionid=' tests/solve/fixtures/`
must return no matches.

Manual steps before `git add`:

1. For each file, grep for auth patterns:
   ```
   grep -E "csrftoken|LEETCODE_SESSION|sessionid" tests/solve/fixtures/*.json
   ```
   Expect NO matches. If any appear, edit the file and strip them (or re-run
   through `src/shared/logger.ts`'s `redact()` helper).
2. Run `jq 'keys' tests/solve/fixtures/accepted.json` (and siblings); eyeball
   for anything credential-like.
3. `submission_id` integers ARE fine — they are public once surfaced by the
   judge and do not authorize any privileged operation.
4. `memory` / `runtime` numbers and percentile fields ARE fine — they are
   public leaderboard-grade data.

## Synthetic Fallback (last-resort)

If you cannot reproducibly trigger a verdict type (MLE is notoriously hard to
trigger on some problems), record a synthetic fixture with the minimum shape
expected by `statusMap.ts` + `verdictModalRenderer.ts` (per "Per-File Shape
Checks" above) and **FLAG IT IN THIS README** below. Synthetic fixtures must
be clearly marked so verify-work knows which assertions are load-bearing
versus approximate.

### Synthetic Fixture Flags

All 8 Wave 0 fixtures were seeded as **SYNTHETIC-NOT-LIVE** by the GSD
executor agent (which does not have live LC session access). Shapes were
drawn from the leetcode-cli helper.js status table + documented LC
response structure. Each fixture has a top-level `_fixture_note` field
confirming its synthetic provenance.

- [x] `accepted.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `wrong-answer.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `tle.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `mle.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `compile-error.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `runtime-error.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `run-sample.json` — synthetic (executor has no live LC; re-capture before Plan 04)
- [x] `run-custom.json` — synthetic (executor has no live LC; re-capture before Plan 04)

**Re-capture gate (blocking for Plan 04 merge):** Every synthetic fixture
MUST be replaced with a live-captured JSON before Plan 04's REST client
ships. A live capture removes the `_fixture_note` field from the JSON and
UPDATES this checklist (checkbox → unchecked OR row removed entirely).
Verify-work in Plan 04 greps for `_fixture_note` in `tests/solve/fixtures/`;
any hit blocks merge.

## Redirect spike result

_(Task 3 — fill this in AFTER running the redirect spike in the Obsidian devtools console.)_

Goal: empirically determine what `requestUrl` does when the judge endpoint
returns `302 → /accounts/login/` due to an expired / invalid session. This
finding drives `src/solve/leetcodeRest.ts`'s `isSessionExpired()` dispatch
(D-27 / A2 / Pitfall 3 in RESEARCH.md).

### Observed behavior

- **Status code observed:** _(DEFERRED — see Status below)_
- **Response text head (first 200 chars):** _(DEFERRED)_
- **`res.headers['location']` present?** _(DEFERRED)_

### Status

- [ ] Spike run against live LC (expired session) — documented above.
- [x] **SPIKE DEFERRED TO PLAN 04** — The GSD executor agent that
  stubbed Wave 0 has no live LC session access and cannot drive Obsidian's
  devtools console. Plan 04 MUST implement BOTH a status-code check (302 /
  401 / 403) AND an HTML body sniff (`<title>Log In - LeetCode</title>` in
  `res.text`) as defense in depth, so `isSessionExpired()` returns true
  regardless of which branch `requestUrl` takes on the redirect.

### Action required in Plan 04

When Plan 04 implements `src/solve/leetcodeRest.ts`:

1. Run the reproduction recipe below against a live LC session that has
   been invalidated (either log out of LC in the browser first, or pass
   `LEETCODE_SESSION=INVALID`).
2. Update the "Observed behavior" block above with the actual values.
3. Flip the checkbox: "Spike run against live LC" → `[x]`, "SPIKE DEFERRED
   TO PLAN 04" → `[ ]`.
4. Adjust `isSessionExpired()` if the live behavior differs from the
   defense-in-depth assumption (e.g., if `requestUrl` transparently
   follows to 200+login-HTML, the status check is a no-op and the HTML
   sniff is the only signal).

### Reproduction recipe

Paste this into Obsidian devtools console with an **invalidated** session
cookie. Expected: `res.status` is meaningful (302/401/403) OR `res.text`
contains `<title>Log In - LeetCode</title>`.

```js
const res = await requestUrl({
  url: 'https://leetcode.com/problems/two-sum/interpret_solution/',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'cookie': 'csrftoken=INVALID; LEETCODE_SESSION=INVALID;',
    'x-csrftoken': 'INVALID',
    'referer': 'https://leetcode.com/problems/two-sum/description/',
  },
  body: JSON.stringify({
    lang: 'python3',
    question_id: '1',
    test_mode: false,
    typed_code: '',
    data_input: '',
  }),
  throw: false,
});
console.log({ status: res.status, headers: res.headers, textHead: res.text.slice(0, 200) });
```

## How downstream code uses these fixtures

- `tests/solve/verdictModalRenderer.test.ts` loads each fixture, feeds it to
  the renderer, and asserts DOM shape. The assertions in that test file
  encode what the shipped modal MUST show.
- `tests/solve/pollingOrchestrator.test.ts` uses `accepted.json` +
  `wrong-answer.json` as terminal-state payloads scripted through
  `makeFakeFetcher`.
- `tests/solve/leetcodeRest.test.ts` uses `run-sample.json` as the reference
  shape for `/interpret_solution/` response parsing.

Downstream implementers MUST NOT modify fixture JSONs to fit their code —
the fixtures are the contract; the code conforms to the fixtures.
