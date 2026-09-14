# E2E Test Infra: UndecGPT

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md` and `survey_spec.md`.
- No dependency on internal implementation details; exercises public interfaces, IPC channels, and window behaviors.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.
- Test runner: Unified `npm test` using Node.js built-in `node:test` runner + headless Electron execution for native Win32 window properties.

## Feature Inventory Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Borderless & Transparent Window | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Always-On-Top Z-Order | R1 | 5 | 5 | ✓ | ✓ |
| 3 | Taskbar & Alt+Tab Exclusion (`WS_EX_TOOLWINDOW`) | R1 | 5 | 5 | ✓ | ✓ |
| 4 | Screen-Share Invisibility (`setContentProtection`) | R1 | 5 | 5 | ✓ | ✓ |
| 5 | Window Geometry Persistence | R1 | 5 | 5 | ✓ | ✓ |
| 6 | Dynamic Opacity Control | R1 | 5 | 5 | ✓ | ✓ |
| 7 | Single Instance Enforcement | R1 | 5 | 5 | ✓ | ✓ |
| 8 | Non-Activating Focus Mode (`WS_EX_NOACTIVATE`) | R1 | 5 | 5 | ✓ | ✓ |
| 9 | Click-Through Mode (`setIgnoreMouseEvents`) | R1 | 5 | 5 | ✓ | ✓ |
| 10 | Silent Keyboard Nudge | R1 | 5 | 5 | ✓ | ✓ |
| 11 | Chat History Silent Scroll | R1 | 5 | 5 | ✓ | ✓ |
| 12 | Boss Key (Quick Hide/Show) | R1 | 5 | 5 | ✓ | ✓ |
| 13 | Emergency Kill Switch | R1 | 5 | 5 | ✓ | ✓ |
| 14 | Pre-Roll Hide Delay | R2 | 5 | 5 | ✓ | ✓ |
| 15 | High-DPI Desktop Capture | R2 | 5 | 5 | ✓ | ✓ |
| 16 | Separate Attach vs Send Flow | R2 | 5 | 5 | ✓ | ✓ |
| 17 | 2-Step Trigger Sequence | R2 | 5 | 5 | ✓ | ✓ |
| 18 | Monkey-Patch Click Interceptor | R2 | 5 | 5 | ✓ | ✓ |
| 19 | Direct `<input type="file">` Fallback | R2 | 5 | 5 | ✓ | ✓ |
| 20 | Synthetic Clipboard Paste Fallback | R2 | 5 | 5 | ✓ | ✓ |
| 21 | Prompt Text Injection | R2 | 5 | 5 | ✓ | ✓ |
| 22 | Message Submit Engine | R2 | 5 | 5 | ✓ | ✓ |
| 23 | Chrome User-Agent Spoofing | R2 | 5 | 5 | ✓ | ✓ |
| 24 | Webdriver Masking | R2 | 5 | 5 | ✓ | ✓ |
| 25 | Google OAuth Popup Handling | R2 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner invocation: `npm test`
- Directory layout:
  - `tests/unit/`: Tier 1 & 2 pure Node.js logic tests (SettingsStore, DPI math, geometry bounds, sanitize logic).
  - `tests/window/`: Tier 1 & 2 Electron native tests (stealth window flags, content protection, non-activating focus, click-through, global shortcuts).
  - `tests/injection/`: Tier 2 & 3 DOM injection, 2-step trigger sequence, click interceptor, paste fallback, submit polling.
  - `tests/e2e/`: Tier 4 end-to-end integration workflows (capture -> attach -> verify -> dispatch -> hide -> exit).

## Pass/Fail Semantics
- Zero exit code on complete pass.
- Non-zero exit code on any assertion failure or unhandled rejection.
- All tests self-contained and cleanup any temporary files/processes.
