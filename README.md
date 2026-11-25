# EdgeDrop Mod 🚀

An enhanced community mod of the **EdgeDrop** desktop clipboard sidebar for Windows.

This mod addresses frustrating UI quirks in the original Microsoft Store version—specifically premature window auto-closing, activation flicker, and focus-stealing on paste—while preserving the sleek edge-docked aesthetic.

---

## ✨ Improvements & Tweaks

### 1. 📋 Multi-Item Persistent Paste
- **Original Behavior:** Clicking or pasting an entry immediately collapsed and dismissed the sidebar, requiring you to re-trigger it every time you needed another snippet.
- **Modded Behavior:** The sidebar stays open while pasting! You can click and paste multiple sequential items without interruption.

### 2. 🎯 Cursor-Presence Lock (Close Only on Exit)
- **Original Behavior:** Focus loss or slight mouse movements would trigger rapid dismissal loops or UI flicker.
- **Modded Behavior:** Whether opened via `Alt + V` or screen-edge hover, the sidebar remains pinned open as long as your cursor stays within its bounds. If opened via hotkey from afar, it stays pinned until you interact and mouse away.

### 3. ⏳ Anti-Flicker Grace Debounce
- **300ms Exit Grace Period:** Accidentally crossing the border for a split second will not dismiss the sidebar. Moving the cursor back inside instantly cancels dismissal.
- **Clean Escape / Hotkey Toggle:** Pressing `Esc` or toggling `Alt + V` closes the sidebar immediately without delay.

### 4. 🔕 Silent Auto-Start on Login
- Integrated with standard Windows User Run registry keys (`--hidden` startup flag).
- Boots silently to the system tray on Windows startup—completely decoupled from Microsoft Store package constraints.

---

## 🗺️ Future Roadmap & Upcoming Tweaks
- [ ] Customizable dock padding and border styling
- [ ] Improved hover timing breakdowns and analytics adjustments
- [ ] Ultra-smooth Framer/Spring easing curves for slide-in transitions
- [ ] Custom hotkey configuration UI
- [ ] Direct export/backup of clipboard history (CSV / JSON)

---

## 🛠️ Installation & Usage

### Option 1: Standalone / Portable
1. Download the latest `EdgeDrop-Mod-win-x64.zip` from the [Releases](https://github.com/Just0DJ/EdgeDrop-Mod/releases) page.
2. Extract to your desired folder (e.g. `C:\Users\%USERNAME%\Dev\EdgeDrop-Mod` or `C:\Program Files\EdgeDrop-Mod`).
3. Run `Edge-Drop mod.exe`.

### Option 2: Run Minimized at Startup
Add a shortcut to `Edge-Drop mod.exe --hidden` in your Windows Startup folder or enable "Launch at login" in the in-app settings.

---

## 💻 Development & Testing

This project uses Node.js and `@electron/asar` to patch and repack the application archive.

### Prerequisites
- Windows 10/11 (x64)
- Node.js 18+

### Running the State-Machine Test Suite
Verify state transitions, debounce grace periods, and multi-paste logic:
```bash
npm test
```

### Repacking `app.asar`
To apply modifications from `extracted/` into the application archive:
```bash
npx asar pack extracted resources/app.asar --unpack "{*.node,*.dll,*.exp,*.lib}"
```

---

## ⚖️ Disclaimer
*EdgeDrop Mod is an independent open-source enhancement mod and is not affiliated with, sponsored by, or endorsed by the original EdgeDrop creators or Microsoft.*
