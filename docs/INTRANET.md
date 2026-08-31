# Parent-owned intranet

Company OS is the parent control plane for repository intranet pages. It discovers child indexes,
keeps the reviewed registry, validates freshness and local links, and coordinates safe page
generators. The repository remains the owner of its page content and generator.

## Configure

```js
export default {
  intranet: {
    registry: "./intranet.json",
    state: "./logs/intranet-state.json",
    maxDepth: 4,
    maintainOnBuild: true,
    executeOnBuild: false,
    requireAgentRule: true,
    requireAgentSkill: true,
    exclude: ["archive/vendor/**"]
  },
  panels: {
    intranet: {}
  }
};
```

## Lifecycle

```bash
company-os intranet scan --init
company-os intranet install-agent-rules --project my-project
company-os intranet maintain --changed my-project/path/to/source.md
company-os intranet sweep
company-os build
```

The initial scan writes candidates. Review a candidate before changing `registration` to
`accepted`, declaring its source globs and generator, and granting `authority.regenerate`.

The normal Company OS build performs a check-only sweep when `maintainOnBuild` is enabled.
`executeOnBuild` additionally allows accepted pages to run safe registered generators when their
sources are newer. Generator commands containing shell chaining or publication, dispatch,
migration, deletion, and reset vocabulary are blocked.

## Agent maintenance

`install-agent-rules` adds a bounded managed block to the selected repository's `AGENTS.md` and
installs the `company-os-intranet-maintainer` skill under `.claude/skills/`. It never replaces
existing instructions or an existing skill.

The rule makes page maintenance part of repository interactions while preserving authority:
refreshing an intranet page never approves, schedules, dispatches, publishes, deletes, or relocates
content.
