/* Family Dashboard – on-screen keyboard for the touch screen.
 * Appears whenever a text box is touched (or opened by a touch), types into it, and hides when you press Done,
 * tap elsewhere, or the box goes away. With a mouse and a real keyboard it stays out of the way.
 * window.FDKeyboard.open(input) opens it for any input; FDKeyboard.always(true) shows it for mouse clicks too.
 */
(function () {
    'use strict';
    var ALWAYS_KEY = 'familyDashboard.kbAlways';
    var LAYOUTS = {
        abc: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '\''],
            ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '{bksp}'],
            ['{sym}', '{space}', '-', '{enter}', '{done}'],
        ],
        sym: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['!', '?', '@', '#', '£', '&', '*', '(', ')', '/'],
            [':', ';', '"', '+', '=', '%', '_', '~', '<', '>'],
            ['{abc}', '€', '$', '[', ']', '{', '}', '|', '\\', '{bksp}'],
            ['{abc}', '{space}', '.', '{enter}', '{done}'],
        ],
    };
    var LABEL = { '{shift}': '⇧', '{bksp}': '⌫', '{sym}': '?123', '{abc}': 'ABC', '{space}': 'space', '{enter}': '↵', '{done}': 'Done ⌄' };
    var kb = null, target = null, layout = 'abc', shift = 1, lastPointer = '', caps = false;

    function always() { try { return localStorage.getItem(ALWAYS_KEY) === '1'; } catch (e) { return false; } }
    function isText(el) {
        if (!el || el.readOnly || el.disabled) return false;
        if (el.tagName === 'TEXTAREA') return true;
        return el.tagName === 'INPUT' && /^(text|search|email|url|tel|password|)$/.test((el.getAttribute('type') || '').toLowerCase());
    }
    function build() {
        kb = document.createElement('div');
        kb.id = 'osk'; kb.className = 'osk';
        kb.innerHTML = '<div class="osk-show"><span class="osk-text"></span><span class="osk-caret"></span></div><div class="osk-keys"></div>';
        document.body.appendChild(kb);
        // Keep the focus in the text box: act on pointerdown and cancel the default.
        kb.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            var k = e.target.closest('[data-k]'); if (!k) return;
            k.classList.add('down'); setTimeout(function () { k.classList.remove('down'); }, 120);
            press(k.getAttribute('data-k'));
        });
        kb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    }
    function draw() {
        var rows = LAYOUTS[layout];
        kb.querySelector('.osk-keys').innerHTML = rows.map(function (r) {
            return '<div class="osk-row">' + r.map(function (k) {
                var lab = LABEL[k] || (shift && layout === 'abc' ? k.toUpperCase() : k);
                var cls = 'osk-k' + (LABEL[k] ? ' fn' : '') + (k === '{space}' ? ' space' : '') + (k === '{done}' ? ' done' : '') +
                    (k === '{enter}' ? ' enter' : '') + (k === '{shift}' && (shift || caps) ? ' on' : '') + (k === '{shift}' && caps ? ' caps' : '');
                return '<button type="button" class="' + cls + '" data-k="' + k.replace(/"/g, '&quot;') + '">' + lab.replace(/</g, '&lt;') + '</button>';
            }).join('') + '</div>';
        }).join('');
        echo();
    }
    function echo() {
        if (!kb || !target) return;
        kb.querySelector('.osk-text').textContent = target.value || '';
        kb.querySelector('.osk-show').setAttribute('data-ph', target.value ? '' : (target.getAttribute('placeholder') || ''));
    }
    function insert(text) {
        var el = target; if (!el) return;
        var max = el.maxLength > 0 ? el.maxLength : Infinity;
        var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
        if (el.value.length - (e - s) + text.length > max) return;
        el.setRangeText(text, s, e, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function press(k) {
        if (!target) return;
        if (k === '{shift}') { if (shift && !caps) caps = true; else { caps = false; shift = shift ? 0 : 1; } draw(); return; }
        if (k === '{sym}') { layout = 'sym'; draw(); return; }
        if (k === '{abc}') { layout = 'abc'; draw(); return; }
        if (k === '{done}') { var t = target; close(); t.blur(); return; }
        if (k === '{bksp}') {
            var el = target, s = el.selectionStart, e = el.selectionEnd;
            if (s === e && s > 0) s--;
            if (e > s) { el.setRangeText('', s, e, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
            if (!el.value) { shift = 1; draw(); } else echo();
            return;
        }
        if (k === '{enter}') {
            if (target.tagName === 'TEXTAREA') { insert('\n'); echo(); return; }
            var t2 = target;
            t2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            t2.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            t2.dispatchEvent(new Event('change', { bubbles: true }));
            if (t2.form && t2.form.requestSubmit) t2.form.requestSubmit();
            if (document.activeElement !== t2 || !document.contains(t2)) close();
            return;
        }
        var ch = k === '{space}' ? ' ' : (layout === 'abc' && (shift || caps) ? k.toUpperCase() : k);
        insert(ch);
        if (shift && !caps && layout === 'abc' && k !== '{space}') { shift = 0; draw(); }
        else if (k === '{space}' || ch === '.') { echo(); } else echo();
    }
    function open(el) {
        if (!isText(el)) return;
        if (!kb) build();
        target = el;
        el.setAttribute('inputmode', 'none');         // no second keyboard from Windows
        layout = 'abc'; caps = false;
        shift = !el.value || /[.!?]\s*$/.test(el.value) ? 1 : 0;
        draw();
        kb.classList.add('on');
        document.body.classList.add('osk-open');
        setTimeout(function () { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }, 50);
    }
    function close() {
        if (!kb) return;
        kb.classList.remove('on');
        document.body.classList.remove('osk-open');
        target = null;
    }

    document.addEventListener('pointerdown', function (e) {
        if (kb && kb.contains(e.target)) return;
        lastPointer = e.pointerType || 'mouse';
        // Tapping outside the keyboard and the text box closes it.
        if (target && e.target !== target && !isText(e.target)) setTimeout(function () { if (target && document.activeElement !== target) close(); }, 0);
    }, true);
    document.addEventListener('focusin', function (e) {
        if (!isText(e.target)) return;
        if (lastPointer === 'touch' || lastPointer === 'pen' || always()) open(e.target);
    });
    document.addEventListener('focusout', function (e) {
        if (e.target !== target) return;
        setTimeout(function () { if (target && document.activeElement !== target) close(); }, 0);
    });
    document.addEventListener('input', function (e) { if (e.target === target) echo(); });
    // A text box that disappears (pop-up closed) takes the keyboard with it.
    setInterval(function () { if (target && !document.contains(target)) close(); }, 500);

    window.FDKeyboard = {
        open: open, close: close,
        always: function (on) { try { localStorage.setItem(ALWAYS_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } },
        isOpen: function () { return !!target; },
    };
})();
