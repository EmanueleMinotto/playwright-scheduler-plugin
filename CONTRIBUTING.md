# Contributing

## Commit messages

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Examples:

```
feat(scheduler): add support for weighted file estimates
fix(reporter): handle missing rootDir gracefully
docs: update GitHub Actions example
```

## Pull requests

Every PR must pass the following checks before merging:

```bash
npm run typecheck   # TypeScript type checking
npm run test        # Unit tests
npm run build       # Package builds without errors
```

These same checks run automatically via the [CI workflow](https://github.com/EmanueleMinotto/playwright-scheduler-plugin/actions/workflows/ci.yml) on every push and pull request.

Keep each PR focused on a single concern. Include or update tests for any logic change.

## Releasing

Publish a new version by creating a GitHub Release. The [publish workflow](https://github.com/EmanueleMinotto/playwright-scheduler-plugin/actions/workflows/publish.yml) will run `typecheck` and `test`, then publish to npm automatically.

Before creating the release, bump the version in `package.json` following [semver](https://semver.org/) and use the version number as the tag (e.g. `v1.2.3`). The publish workflow requires an `NPM_TOKEN` secret configured in the repository settings.
