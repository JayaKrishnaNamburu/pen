# Changesets

Pen uses [Changesets](https://github.com/changesets/changesets) for versioning and npm releases.

## Local workflow

1. Run `pnpm changeset` and describe the user-facing package changes.
2. Merge the changeset with the feature work.
3. Let the release workflow open or update the release PR on `main`.
4. When the release PR merges, the release workflow publishes the public packages.

## Notes

- `@pen/docs` is private and excluded from release versioning.
- Public package access is configured repo-wide in `.changeset/config.json` and reinforced in each public package manifest.
- Package metadata can be re-synced with `pnpm sync:package-metadata`.
