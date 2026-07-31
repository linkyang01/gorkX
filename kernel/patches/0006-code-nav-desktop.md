# 0006 — desktop code navigation

Allows the locked Grok Build code-navigation index to serve the declared
`grok-desktop` client when it advertises `x.ai/codeNavigation.enabled`.
Grok Web remains supported; terminal, generic, and extension clients stay
behind the upstream gate. The index, eligibility checks, and response shapes
remain kernel-owned.
