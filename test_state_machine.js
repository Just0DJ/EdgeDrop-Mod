import assert from 'node:assert/strict';

// Lightweight simulation of EdgeDrop Sidebar State Machine
class EdgeDropStateMachine {
  constructor(options = {}) {
    this.keepOpenUntilCursorLeaves = options.keepOpenUntilCursorLeaves ?? true;
    this.open = false;
    this.edgeHotkey = false;
    this.edgeEntered = false;
    this.closeTimer = null;
    this.hoverTimer = null;
    this.pasteCount = 0;
    this.bounds = { xMin: 0, xMax: 270, yMin: 100, yMax: 800 };
  }

  // Edge hover trigger
  onEdgeHoverEnter(now = Date.now()) {
    if (this.open) return;
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      this.open = true;
      this.edgeHotkey = false;
      this.edgeEntered = false;
    }, 250); // 250ms debounce
  }

  onEdgeHoverCancel() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  // Hotkey Alt+V toggle
  onHotkeyToggle() {
    if (!this.open) {
      this.open = true;
      this.edgeHotkey = true;
      this.edgeEntered = false;
      this.cancelCloseTimer();
    } else {
      this.open = false;
      this.edgeHotkey = false;
      this.edgeEntered = false;
      this.cancelCloseTimer();
    }
  }

  // Escape key
  onEscape() {
    if (this.open) {
      this.open = false;
      this.edgeHotkey = false;
      this.edgeEntered = false;
      this.cancelCloseTimer();
    }
  }

  cancelCloseTimer() {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  scheduleClose(delay = 300) {
    if (this.closeTimer) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.open = false;
    }, delay);
  }

  // Paste action
  onPaste() {
    this.pasteCount++;
    if (!this.keepOpenUntilCursorLeaves) {
      this.open = false;
    }
    // With keepOpenUntilCursorLeaves: true, paste NEVER closes the panel
  }

  // Blur event (focus shift to external app during paste)
  onBlur() {
    if (this.keepOpenUntilCursorLeaves) {
      return; // Ignored by design
    }
    this.scheduleClose(400);
  }

  // Cursor position update
  onCursorMove(x, y) {
    const isInside = (x >= this.bounds.xMin && x <= this.bounds.xMax &&
                      y >= this.bounds.yMin && y <= this.bounds.yMax);

    if (this.open) {
      if (isInside) {
        this.edgeEntered = true;
        this.cancelCloseTimer();
      } else {
        if (this.edgeHotkey && !this.edgeEntered) {
          // Hotkey opened while cursor outside: stay pinned!
          return;
        }
        // Cursor left: schedule debounced close (300ms)
        this.scheduleClose(300);
      }
    }
  }
}

// RUN TESTS
console.log('--- RUNNING EDGEDROP STATE TRANSITION TESTS ---');

// Test 1: Open via Alt+V while cursor outside -> Move in -> Paste -> Paste again -> Move out -> Auto close
{
  const sm = new EdgeDropStateMachine({ keepOpenUntilCursorLeaves: true });
  assert.equal(sm.open, false);

  // 1. Hotkey Alt+V opens
  sm.onHotkeyToggle();
  assert.equal(sm.open, true, 'Should be open after Alt+V');
  assert.equal(sm.edgeHotkey, true);
  assert.equal(sm.edgeEntered, false);

  // 2. Cursor outside at (500, 500)
  sm.onCursorMove(500, 500);
  assert.equal(sm.open, true, 'Should stay pinned when cursor is outside after hotkey');
  assert.equal(sm.closeTimer, null, 'No close timer should be scheduled while pinned outside');

  // 3. Blur occurs (external window focus)
  sm.onBlur();
  assert.equal(sm.open, true, 'Blur must not close sidebar');

  // 4. Cursor enters sidebar at (150, 400)
  sm.onCursorMove(150, 400);
  assert.equal(sm.edgeEntered, true, 'Cursor entered recorded');

  // 5. User clicks paste item 1
  sm.onPaste();
  assert.equal(sm.open, true, 'Paste must NOT close sidebar');
  sm.onBlur(); // External focus transfer during simulatePaste
  assert.equal(sm.open, true, 'External focus transfer during paste must not close sidebar');

  // 6. User clicks paste item 2 (multi-paste)
  sm.onPaste();
  assert.equal(sm.open, true, 'Second paste must NOT close sidebar');
  assert.equal(sm.pasteCount, 2);

  // 7. Cursor leaves sidebar to (600, 400)
  sm.onCursorMove(600, 400);
  assert.notEqual(sm.closeTimer, null, 'Close timer must be scheduled on exit');

  // 8. Cursor re-enters within grace period (at 100ms)
  sm.onCursorMove(150, 400);
  assert.equal(sm.closeTimer, null, 'Close timer must be cancelled on re-entry');
  assert.equal(sm.open, true, 'Sidebar must remain open on re-entry');

  // 9. Cursor exits again and grace period expires
  sm.onCursorMove(600, 400);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(sm.open, false, 'Sidebar must cleanly close after 300ms outside grace period');

  console.log('✔ Test 1 Passed: Alt+V -> Cursor outside lock -> Move in -> Multi-paste -> Graceful exit');
}

// Test 2: Edge Hover Activation -> 250ms debounce -> Inside lock -> Exit
{
  const sm = new EdgeDropStateMachine({ keepOpenUntilCursorLeaves: true });
  
  // 1. Edge brush for only 100ms
  sm.onEdgeHoverEnter();
  await new Promise(resolve => setTimeout(resolve, 100));
  sm.onEdgeHoverCancel();
  assert.equal(sm.open, false, 'Brushing edge < 250ms must not trigger open');

  // 2. Intentional edge hover for 260ms
  sm.onEdgeHoverEnter();
  await new Promise(resolve => setTimeout(resolve, 270));
  assert.equal(sm.open, true, 'Holding edge > 250ms must open sidebar');

  // 3. Paste item
  sm.onPaste();
  assert.equal(sm.open, true, 'Paste must not close sidebar');

  console.log('✔ Test 2 Passed: Edge Hover 250ms Debounce & Persistent Paste');
}

// Test 3: Escape & Alt+V toggle closure
{
  const sm = new EdgeDropStateMachine({ keepOpenUntilCursorLeaves: true });
  sm.onHotkeyToggle();
  assert.equal(sm.open, true);
  sm.onEscape();
  assert.equal(sm.open, false, 'Escape must cleanly close sidebar');

  sm.onHotkeyToggle();
  assert.equal(sm.open, true);
  sm.onHotkeyToggle();
  assert.equal(sm.open, false, 'Second Alt+V must cleanly toggle close');

  console.log('✔ Test 3 Passed: Escape and Alt+V clean toggle');
}

console.log('--- ALL TESTS PASSED SUCCESSFULLY (0 ERRORS) ---');
