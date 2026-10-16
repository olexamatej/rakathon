## Change

What changed and why? Keep unrelated cleanup in a separate change.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run export:web -- --max-workers 1`
- [ ] Dependency changes include the lockfile and an audit review (or are not applicable).
- [ ] No credentials, identifiable health records, or generated outputs are included.

Describe manual checks or explain any skipped checks. A web export does not verify
native camera permissions or behavior on a phone.
