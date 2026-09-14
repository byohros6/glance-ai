# UndecGPT 🛡️

A free, lightweight, open-source undetectable AI assistant that embeds the native **Google Gemini** web application directly into a stealth overlay on your laptop.

Unlike WhisprGPT (which demands an expensive recurring subscription) or Cue (which uses its own custom UI requiring API keys), **UndecGPT** embeds the **official Google Gemini Web UI** so you can log into your own Google Account and use Gemini Advanced / 2.0 with all your chat history, Gems, and code execution—100% free forever.

---

## Key Features

- **Screen-Share Invisible (Stealth Mode)**: Uses Windows `SetWindowDisplayAffinity` (`setContentProtection(true)`). The overlay window is completely invisible to Zoom, Microsoft Teams, Google Meet, Discord, Slack, OBS, Loom, and screen capture software.
- **Official Gemini Web UI**: Authentic Google Gemini interface directly embedded, with full support for Google authentication (via Chrome user-agent spoofing & webdriver masking).
- **Separate Attach & Send**:
  - **`Ctrl + S`**: Takes screenshot & attaches it directly into Gemini with your custom prompt without auto-sending.
  - **`Ctrl + Enter`**: Submits the message to Gemini when you're ready.
- **Non-Activating Focus Mode (Like WhisprGPT)**:
  - Toggle between **Focus: ON** and **Focus: OFF** via **`Ctrl + F`** or the top toolbar button.
  - When **OFF**, clicking or scrolling on UndecGPT **never steals focus** from your other active application (VS Code, terminal, test window). You cannot type in Gemini while in this mode, preventing accidental keystrokes.
  - When **ON**, clicking UndecGPT focuses it so you can type directly into Gemini.
- **Silent Keyboard Controls**: Move the window around your screen without touching the mouse (`Ctrl + Arrows`) and scroll Gemini chat history (`Ctrl + Shift + Arrows`).
- **Boss Key / Quick Hide (`Ctrl + H`)**: Instantly toggle window visibility.
- **Emergency Kill Switch (`Ctrl + Shift + Q`)**: Instantly terminates the application.
- **Opacity Control**: Adjust window transparency seamlessly from 100% down to 15% using `Ctrl + [` and `Ctrl + ]` or the toolbar slider.

---

## Global Hotkeys

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Ctrl + S`** | **Attach Screenshot** | Snaps screen, attaches to Gemini with prompt (does NOT send) |
| **`Ctrl + Enter`** | **Send Message** | Submits prompt and screenshot to Gemini |
| **`Ctrl + F`** | **Toggle Focus Mode** | Toggles whether clicking UndecGPT steals focus from other apps |
| **`Ctrl + H`** | **Boss Key (Hide/Show)** | Toggles overlay visibility instantly |
| **`Ctrl + ↑ / ↓ / ← / →`** | **Silent Nudge** | Moves the window 40px in any direction |
| **`Ctrl + Shift + ↑ / ↓`** | **Scroll Chat** | Scrolls Gemini chat history up / down |
| **`Ctrl + [`** | **Dim Opacity** | Decreases window opacity by 10% |
| **`Ctrl + ]`** | **Brighten Opacity** | Increases window opacity by 10% |
| **`Ctrl + Shift + Q`** | **Emergency Exit** | Closes and kills UndecGPT instantly |

---

## Quick Start

### 1. Launching UndecGPT
From this folder, you can run:
```bash
npm start
```
Or simply double-click **`run.bat`**!

### 2. Signing In to Google Gemini
When the window appears:
1. Click **Sign in** on the Gemini page.
2. Enter your Google account credentials as you normally would.
3. Your session and cookies are stored persistently on your laptop in Electron's secure user data directory, so you stay logged in.

### 3. Customizing Your Screen-Solve Prompt
Click the **⚙️ (Settings)** icon in the top toolbar to change:
- Your default screen-solving prompt (e.g. for coding interviews, exams, or meeting assistance).
- Auto-submit toggle (whether it immediately presses send or lets you review the screenshot first).
