# UndecGPT 🛡️

A free, lightweight, open-source undetectable AI assistant that embeds the native **Google Gemini** web application directly into a stealth overlay on your laptop.

Unlike WhisprGPT (which demands an expensive recurring subscription) or Cue (which uses its own custom UI requiring API keys), **UndecGPT** embeds the **official Google Gemini Web UI** so you can log into your own Google Account and use Gemini Advanced / 2.0 with all your chat history, Gems, and code execution—100% free forever.

---

## Key Features

- **Taskbar & Alt+Tab Exclusion (`WS_EX_TOOLWINDOW`)**: The application is completely invisible on the Windows taskbar (no taskbar icon, no running blue underline bar) and omitted from the `Alt + Tab` task switcher.
- **Screen-Share Invisible (Stealth Mode)**: Uses Windows `SetWindowDisplayAffinity` (`setContentProtection(true)`). The overlay window is completely invisible to Zoom, Microsoft Teams, Google Meet, Discord, Slack, OBS, Loom, and screen capture software.
- **Official Gemini Web UI**: Authentic Google Gemini interface directly embedded, with full support for Google authentication (via Chrome user-agent spoofing & webdriver masking).
- **Separate Attach & Send**:
  - **`Ctrl + S`**: Takes screenshot with 100ms compositor pre-roll hide (never captures itself or black boxes), attaches it directly into Gemini with your custom prompt without auto-sending.
  - **`Ctrl + Enter`** (or **`Ctrl + Return`**): Submits the message to Gemini when you're ready.
- **Non-Activating Focus Mode (Like WhisprGPT)**:
  - Toggle between **Focus: ON** and **Focus: OFF** via **`Ctrl + F`** or the top toolbar button.
  - When **OFF** (`WS_EX_NOACTIVATE`), clicking or scrolling on UndecGPT **never steals focus** from your active application (VS Code, terminal, test window). You cannot type in Gemini while in this mode, keeping your keyboard focused on your work.
  - When **ON**, clicking UndecGPT focuses it so you can type directly into Gemini.
- **Click-Through Mode (`Ctrl + M`)**:
  - Toggle with **`Ctrl + M`** or the top toolbar button (`🖱️ Click-Thru`).
  - When **ON**, all mouse clicks pass straight through the overlay into the window, game, or editor beneath it. Hovering over the slim stealth top bar restores controls so you can easily toggle it off or drag the window.
- **Silent Keyboard Controls**: Move the window around your screen without touching the mouse (`Ctrl + Arrows`) and scroll Gemini chat history (`Ctrl + Shift + Arrows`).
- **Boss Key / Quick Hide (`Ctrl + H`)**: Instantly toggle window visibility.
- **Emergency Kill Switch (`Ctrl + Shift + Q`)**: Instantly terminates the application.
- **Opacity Control**: Adjust window transparency seamlessly from 100% down to 15% using `Ctrl + [` and `Ctrl + ]` or the toolbar slider.

---

## Global Hotkeys

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Ctrl + S`** | **Attach Screenshot** | Pre-roll hides window, snaps screen, attaches to Gemini with prompt (does NOT send) |
| **`Ctrl + Enter`** | **Send Message** | Submits prompt and screenshot to Gemini |
| **`Ctrl + F`** | **Toggle Focus Mode** | Toggles non-activating mode (clicking does not steal focus from other apps) |
| **`Ctrl + M`** | **Toggle Click-Through** | Passes mouse clicks through to the apps beneath UndecGPT |
| **`Ctrl + H`** | **Boss Key (Hide/Show)** | Toggles overlay visibility instantly |
| **`Ctrl + ↑ / ↓ / ← / →`** | **Silent Nudge** | Moves the window 40px in any direction |
| **`Ctrl + Shift + ↑ / ↓`** | **Scroll Chat** | Scrolls Gemini chat history up / down |
| **`Ctrl + [`** | **Dim Opacity** | Decreases window opacity by 10% |
| **`Ctrl + ]`** | **Brighten Opacity** | Increases window opacity by 10% |
| **`Ctrl + Shift + Q`** | **Emergency Exit** | Closes and kills UndecGPT instantly |

---

## Quick Start & Running

### 1. Launching in Developer Mode
Run:
```bash
npm start
```
Or double-click **`run.bat`**!

### 2. Building a Standalone Portable `.exe`
To package a single, zero-dependency portable `.exe` that runs on any Windows machine without Node.js or npm:
```bash
npm run dist
```
Or double-click **`build.bat`**!
The resulting executable is generated at:
```
dist/UndecGPT-Portable.exe
```

### 3. Running Automated Tests
Run the complete 20-suite automated test harness covering all 4 tiers:
```bash
npm test
```

### 4. Customizing Your Screen-Solve Prompt
Click the **⚙️ (Settings)** icon in the top toolbar to change:
- Your default screen-solving prompt (e.g. for coding interviews, exams, or meeting assistance).
- Focusable & click-through default states.
