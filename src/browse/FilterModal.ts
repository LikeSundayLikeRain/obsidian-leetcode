// src/browse/FilterModal.ts
// LeetCode-style compound filter modal. Opened from the problem browser view's
// filter icon. Produces a CompoundFilter value which is persisted via
// SettingsStore.setFilter() and applied via ProblemListService.applyCompoundFilter().
//
// Fields supported today: Status, Difficulty, Topics, Question ID range,
// Acceptance range, Premium. Language / Last Submit / Published are deferred
// (see .planning/phases/01-plugin-foundation/DEFERRED-FILTERS.md).
import { App, Modal, setIcon, Notice } from 'obsidian';
import type { CompoundFilter, FilterRule } from '../settings/SettingsStore';

/** Human-readable label for each supported field. Drives the add-field menu. */
interface FieldDef {
  key: FilterRule['field'];
  label: string;
  icon: string;
  /** Returns a fresh empty rule for this field. */
  blank: () => FilterRule;
}

const FIELD_DEFS: FieldDef[] = [
  // Icon choices mirror LC's own iconography (see user-provided screenshots).
  // `gauge` gives the speedometer used for Difficulty. Icons without a direct
  // Lucide match use the closest available primitive.
  { key: 'status',      label: 'Status',      icon: 'check-square',
    blank: () => ({ field: 'status', op: 'is', values: [] }) },
  { key: 'difficulty',  label: 'Difficulty',  icon: 'gauge',
    blank: () => ({ field: 'difficulty', op: 'is', values: [] }) },
  { key: 'topics',      label: 'Topics',      icon: 'tag',
    blank: () => ({ field: 'topics', op: 'is', values: [] }) },
  { key: 'question-id', label: 'Question ID', icon: 'list-ordered',
    blank: () => ({ field: 'question-id', op: 'range', min: null, max: null }) },
  { key: 'acceptance',  label: 'Acceptance',  icon: 'cloud',
    blank: () => ({ field: 'acceptance', op: 'range', min: null, max: null }) },
  { key: 'premium',     label: 'Premium',     icon: 'crown',
    blank: () => ({ field: 'premium', op: 'is', value: null }) },
];

/** Filter fields pre-populated when the modal opens empty (matches LC's
 *  starting layout — Status, Difficulty, Topics are visible rows even before
 *  the user adds anything). Language is shown too but rendered as a disabled
 *  stub since per-problem language data is deferred to Phase 3
 *  (see .planning/phases/01-plugin-foundation/DEFERRED-FILTERS.md). */
const PREPOPULATED_FIELDS: FilterRule['field'][] = ['status', 'difficulty', 'topics'];
/** Deferred fields shown as visible-but-disabled rows to match LC's layout
 *  without committing to implementation. Each entry owns its own icon/label
 *  since they aren't in FIELD_DEFS (wouldn't be selectable via the + menu). */
const DEFERRED_STUB_FIELDS: { key: string; label: string; icon: string; reason: string }[] = [
  {
    key: 'language',
    label: 'Language',
    icon: 'code-2',
    reason: 'Coming with Run & Submit in a future release',
  },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'untouched', label: 'Todo' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'solved',    label: 'Solved' },
];

const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Easy',   label: 'Easy' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Hard',   label: 'Hard' },
];

const PREMIUM_OPTIONS: { value: 'premium' | 'non-premium'; label: string }[] = [
  { value: 'premium',     label: 'Premium Content' },
  { value: 'non-premium', label: 'Non-Premium Content' },
];

/** Turn a topic slug ('hash-table') into a display label ('Hash Table'). */
function formatTopicLabel(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export class FilterModal extends Modal {
  private draft: CompoundFilter;
  private readonly topicSlugs: string[]; // sorted unique slugs from the cached index
  private rulesEl: HTMLElement | null = null;
  private readonly onApply: (f: CompoundFilter | null) => void;

  constructor(
    app: App,
    initial: CompoundFilter | null,
    topicSlugs: string[],
    onApply: (f: CompoundFilter | null) => void,
  ) {
    super(app);
    // Clone so edits don't mutate the caller's object until Apply is pressed.
    this.draft = initial
      ? { match: initial.match, rules: initial.rules.map((r) => ({ ...r })) }
      : { match: 'all', rules: [] };
    this.topicSlugs = [...new Set(topicSlugs)].sort();
    this.onApply = onApply;
  }

  onOpen(): void {
    this.modalEl.addClass('lc-filter-modal');
    const { contentEl } = this;
    contentEl.empty();
    // Pre-populate standard LC-style rows when the modal opens empty so the
    // user sees a consistent "always-there" set of filters. Existing rules
    // from a prior Apply are kept; missing standard fields are added as blank.
    this.ensurePrepopulated();
    this.renderMatchHeader(contentEl);
    this.rulesEl = contentEl.createDiv({ cls: 'lc-fm__rules' });
    this.renderRules();
    this.renderAddButton(contentEl);
    this.renderFooter(contentEl);
  }

  /** Ensure Status/Difficulty/Topics rules exist even if the user hasn't
   *  picked any values yet. Matches LC's starting layout (screenshot 14). */
  private ensurePrepopulated(): void {
    for (const fieldKey of PREPOPULATED_FIELDS) {
      if (!this.draft.rules.some((r) => r.field === fieldKey)) {
        const def = FIELD_DEFS.find((d) => d.key === fieldKey);
        if (def) this.draft.rules.push(def.blank());
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderMatchHeader(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__match' });
    wrap.createSpan({ text: 'Match ' });
    // Chevron picker for All/Any so it looks like the value pickers below,
    // matching LC's uniform "everything is a dropdown" aesthetic.
    this.renderChevronSingleSelect(wrap, [
      { value: 'all', label: 'All' },
      { value: 'any', label: 'Any' },
    ], this.draft.match, (next) => {
      this.draft.match = next as 'all' | 'any';
    });
    wrap.createSpan({ text: ' of the following filters:' });
  }

  /** Small single-select chevron picker for fixed-option fields like
   *  match-mode (All/Any) and per-rule operator (is/is not). The selected
   *  value is always displayed as plain text (no pill chrome) since these
   *  pickers are inline in a sentence-like context. */
  private renderChevronSingleSelect(
    parent: HTMLElement,
    options: { value: string; label: string }[],
    current: string,
    onChange: (next: string) => void,
  ): HTMLElement {
    const picker = parent.createSpan({
      cls: 'lc-fm__picker lc-fm__picker--inline',
      attr: { role: 'button', tabindex: '0' },
    });
    const valCell = picker.createSpan({ cls: 'lc-fm__picker-val lc-fm__picker-val--inline' });
    let selected = current;
    const renderValue = (): void => {
      valCell.empty();
      const opt = options.find((o) => o.value === selected);
      valCell.setText(opt ? opt.label : '');
    };
    renderValue();
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');

    picker.addEventListener('click', () => {
      const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
      const rect = picker.getBoundingClientRect();
      const parentRect = this.contentEl.getBoundingClientRect();
      menu.setCssStyles({
        position: 'absolute',
        top: `${String(rect.bottom - parentRect.top + 4)}px`,
        left: `${String(rect.left - parentRect.left)}px`,
        minWidth: `${String(Math.max(120, rect.width))}px`,
      });
      for (const o of options) {
        const item = menu.createDiv({ cls: 'lc-fm__popover-item' });
        const check = item.createSpan({ cls: 'lc-fm__popover-check' });
        if (selected === o.value) setIcon(check, 'check');
        item.createSpan({ cls: 'lc-fm__popover-label', text: o.label });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selected = o.value;
          renderValue();
          onChange(selected);
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        });
      }
      const close = (e: MouseEvent): void => {
        if (!menu.contains(e.target as Node) && !picker.contains(e.target as Node)) {
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        }
      };
      activeWindow.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
    });
    return picker;
  }

  private renderRules(): void {
    if (!this.rulesEl) return;
    this.rulesEl.empty();
    this.draft.rules.forEach((r, i) => this.renderRule(this.rulesEl!, r, i));
    // Append disabled stubs for fields deferred to future phases (Language, etc.)
    // so the modal layout matches LC's while the user discovers that the
    // capability isn't available yet via a tooltip.
    for (const stub of DEFERRED_STUB_FIELDS) {
      this.renderDeferredStub(this.rulesEl, stub);
    }
  }

  private renderDeferredStub(
    parent: HTMLElement,
    stub: { key: string; label: string; icon: string; reason: string },
  ): void {
    const row = parent.createDiv({ cls: 'lc-fm__rule lc-fm__rule--disabled' });
    row.setAttribute('title', stub.reason);
    const fieldCell = row.createDiv({ cls: 'lc-fm__rule-field' });
    const iconEl = fieldCell.createSpan({ cls: 'lc-fm__rule-ficon' });
    setIcon(iconEl, stub.icon);
    fieldCell.createSpan({ text: stub.label });
    // Operator: "is" (disabled)
    row.createDiv({ cls: 'lc-fm__rule-op', text: 'is' });
    // Value: empty chevron (disabled)
    const valCell = row.createDiv({ cls: 'lc-fm__rule-val' });
    const picker = valCell.createDiv({ cls: 'lc-fm__picker' });
    picker.createSpan({ cls: 'lc-fm__picker-val' });
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');
    // Remove column placeholder (keeps grid alignment); no remove action.
    row.createDiv({ cls: 'lc-fm__rule-rm' });
  }

  private renderRule(parent: HTMLElement, rule: FilterRule, idx: number): void {
    const row = parent.createDiv({ cls: 'lc-fm__rule' });
    const def = FIELD_DEFS.find((d) => d.key === rule.field);
    if (!def) return;

    // Field label with icon
    const fieldCell = row.createDiv({ cls: 'lc-fm__rule-field' });
    const iconEl = fieldCell.createSpan({ cls: 'lc-fm__rule-ficon' });
    setIcon(iconEl, def.icon);
    fieldCell.createSpan({ text: def.label });

    // Operator dropdown — varies by field
    this.renderOperator(row, rule, idx);

    // Value editor — varies by field
    this.renderValueEditor(row, rule, idx);

    // Remove button
    const rm = row.createDiv({ cls: 'lc-fm__rule-rm', attr: { 'aria-label': 'Remove rule' } });
    setIcon(rm, 'minus');
    rm.addEventListener('click', () => {
      this.draft.rules.splice(idx, 1);
      this.renderRules();
    });
  }

  private renderOperator(row: HTMLElement, rule: FilterRule, _idx: number): void {
    const cell = row.createDiv({ cls: 'lc-fm__rule-op' });
    if (rule.field === 'question-id' || rule.field === 'acceptance') {
      cell.setText('Range');
      return;
    }
    if (rule.field === 'premium') {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- 'is' is a filter operator label (not a sentence); keep lowercase to match LeetCode's filter UI convention
      cell.setText('is');
      return;
    }
    // status / difficulty / topics → is / is-not chevron picker (matches the
    // other dropdowns in the modal; no native select chrome).
    this.renderChevronSingleSelect(cell, [
      { value: 'is',     label: 'is' },
      { value: 'is-not', label: 'is not' },
    ], rule.op, (next) => {
      if (rule.field === 'status' || rule.field === 'difficulty' || rule.field === 'topics') {
        rule.op = next as 'is' | 'is-not';
      }
    });
  }

  private renderValueEditor(row: HTMLElement, rule: FilterRule, _idx: number): void {
    const cell = row.createDiv({ cls: 'lc-fm__rule-val' });
    switch (rule.field) {
      case 'status':
        this.renderMultiSelect(cell, rule, STATUS_OPTIONS);
        break;
      case 'difficulty':
        this.renderMultiSelect(cell, rule, DIFFICULTY_OPTIONS);
        break;
      case 'topics': {
        const topicOpts = this.topicSlugs.map((s) => ({ value: s, label: formatTopicLabel(s) }));
        if (topicOpts.length === 0) {
          cell.createSpan({ text: '(load problems first)', cls: 'lc-fm__empty-hint' });
        } else {
          this.renderMultiSelect(cell, rule, topicOpts);
        }
        break;
      }
      case 'question-id':
        this.renderRangeEditor(cell, rule, 1, 99999);
        break;
      case 'acceptance':
        this.renderRangeEditor(cell, rule, 0, 100, '%');
        break;
      case 'premium':
        this.renderPremiumEditor(cell, rule);
        break;
    }
  }

  /** Render a multi-select with LC-style layout: inline chips like `Easy` `Med.`
   *  optionally followed by a `+N` overflow pill, right-aligned chevron that
   *  opens a checkbox popover with all choices. Matches screenshot 14. */
  private renderMultiSelect(
    parent: HTMLElement,
    rule: FilterRule & { values: string[] },
    options: { value: string; label: string }[],
  ): void {
    const picker = parent.createDiv({ cls: 'lc-fm__picker', attr: { role: 'button', tabindex: '0' } });
    const valCell = picker.createSpan({ cls: 'lc-fm__picker-val' });
    const renderValueChips = (): void => {
      valCell.empty();
      // Show up to 2 pills inline; overflow as `+N`.
      const shown = rule.values.slice(0, 2);
      const hidden = rule.values.length - shown.length;
      for (const v of shown) {
        const opt = options.find((o) => o.value === v);
        const label = opt ? opt.label : formatTopicLabel(v);
        valCell.createSpan({ cls: 'lc-fm__picker-pill', text: label });
      }
      if (hidden > 0) {
        valCell.createSpan({ cls: 'lc-fm__picker-pill lc-fm__picker-pill--more',
          text: `+${String(hidden)}` });
      }
    };
    renderValueChips();
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');

    picker.addEventListener('click', () => {
      this.openValuePopover(picker, options, rule.values, (next) => {
        rule.values = next;
        renderValueChips();
      });
    });
  }

  /** Floating checkbox menu anchored below `anchor`. Multi-select with
   *  immediate callbacks; closes on outside-click. Same pattern as the
   *  add-rule menu but with checkboxes + stay-open-on-pick. */
  private openValuePopover(
    anchor: HTMLElement,
    options: { value: string; label: string }[],
    selected: string[],
    onChange: (next: string[]) => void,
  ): void {
    const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
    const rect = anchor.getBoundingClientRect();
    const parentRect = this.contentEl.getBoundingClientRect();
    menu.setCssStyles({
      position: 'absolute',
      top: `${String(rect.bottom - parentRect.top + 4)}px`,
      left: `${String(rect.left - parentRect.left)}px`,
      minWidth: `${String(Math.max(160, rect.width))}px`,
    });

    const current = new Set(selected);
    for (const o of options) {
      const item = menu.createDiv({ cls: 'lc-fm__popover-item' });
      const check = item.createSpan({ cls: 'lc-fm__popover-check' });
      if (current.has(o.value)) setIcon(check, 'check');
      item.createSpan({ cls: 'lc-fm__popover-label', text: o.label });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (current.has(o.value)) current.delete(o.value);
        else current.add(o.value);
        // Re-render the checkmark in-place.
        check.empty();
        if (current.has(o.value)) setIcon(check, 'check');
        // Preserve option order in the `selected` list for stable display.
        onChange(options.filter((x) => current.has(x.value)).map((x) => x.value));
      });
    }

    const close = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        menu.remove();
        activeDocument.removeEventListener('click', close, true);
      }
    };
    activeWindow.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
  }

  private renderRangeEditor(
    parent: HTMLElement,
    rule: FilterRule & { min: number | null; max: number | null },
    _minBound: number,
    _maxBound: number,
    suffix = '',
  ): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__range' });
    const minInput = wrap.createEl('input', {
      attr: { type: 'number', placeholder: `min${suffix}`, 'aria-label': 'Minimum' },
    });
    if (rule.min !== null) minInput.value = String(rule.min);
    minInput.addEventListener('input', () => {
      rule.min = minInput.value === '' ? null : Number(minInput.value);
    });
    wrap.createSpan({ text: ' – ', cls: 'lc-fm__range-sep' });
    const maxInput = wrap.createEl('input', {
      attr: { type: 'number', placeholder: `max${suffix}`, 'aria-label': 'Maximum' },
    });
    if (rule.max !== null) maxInput.value = String(rule.max);
    maxInput.addEventListener('input', () => {
      rule.max = maxInput.value === '' ? null : Number(maxInput.value);
    });
  }

  private renderPremiumEditor(
    parent: HTMLElement,
    rule: FilterRule & { value: 'premium' | 'non-premium' | null },
  ): void {
    // Single-select chevron picker matching the multi-select look. Displays
    // the current label inline; a popover lets the user pick exactly one
    // (or clear by picking the same value again).
    const picker = parent.createDiv({ cls: 'lc-fm__picker', attr: { role: 'button', tabindex: '0' } });
    const valCell = picker.createSpan({ cls: 'lc-fm__picker-val' });
    const renderValue = (): void => {
      valCell.empty();
      if (rule.value !== null) {
        const opt = PREMIUM_OPTIONS.find((o) => o.value === rule.value);
        if (opt) valCell.createSpan({ cls: 'lc-fm__picker-pill', text: opt.label });
      }
    };
    renderValue();
    const chev = picker.createSpan({ cls: 'lc-fm__picker-chev' });
    setIcon(chev, 'chevron-down');

    picker.addEventListener('click', () => {
      const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
      const rect = picker.getBoundingClientRect();
      const parentRect = this.contentEl.getBoundingClientRect();
      menu.setCssStyles({
        position: 'absolute',
        top: `${String(rect.bottom - parentRect.top + 4)}px`,
        left: `${String(rect.left - parentRect.left)}px`,
        minWidth: `${String(Math.max(160, rect.width))}px`,
      });
      for (const o of PREMIUM_OPTIONS) {
        const item = menu.createDiv({ cls: 'lc-fm__popover-item' });
        const check = item.createSpan({ cls: 'lc-fm__popover-check' });
        if (rule.value === o.value) setIcon(check, 'check');
        item.createSpan({ cls: 'lc-fm__popover-label', text: o.label });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          rule.value = rule.value === o.value ? null : o.value;
          renderValue();
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        });
      }
      const close = (e: MouseEvent): void => {
        if (!menu.contains(e.target as Node) && !picker.contains(e.target as Node)) {
          menu.remove();
          activeDocument.removeEventListener('click', close, true);
        }
      };
      activeWindow.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
    });
  }

  private renderAddButton(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: 'lc-fm__add' });
    const btn = wrap.createDiv({ cls: 'lc-fm__add-btn', attr: { 'aria-label': 'Add filter rule' } });
    setIcon(btn, 'plus');
    btn.addEventListener('click', () => {
      // Offer a picker of field types not yet used (LC allows duplicates, but
      // for v1 we keep one rule per field to avoid confusing compound cases).
      const used = new Set(this.draft.rules.map((r) => r.field));
      const available = FIELD_DEFS.filter((d) => !used.has(d.key));
      if (available.length === 0) {
        new Notice('All filter fields are in use.', 3000);
        return;
      }
      this.openAddMenu(btn, available);
    });
  }

  private openAddMenu(anchor: HTMLElement, fields: FieldDef[]): void {
    // Lightweight popover: a floating div anchored below the + button.
    // Closes on outside-click.
    const menu = this.contentEl.createDiv({ cls: 'lc-fm__add-menu' });
    const rect = anchor.getBoundingClientRect();
    const parentRect = this.contentEl.getBoundingClientRect();
    menu.setCssStyles({
      position: 'absolute',
      top: `${String(rect.bottom - parentRect.top + 4)}px`,
      left: `${String(rect.left - parentRect.left)}px`,
    });
    for (const f of fields) {
      const item = menu.createDiv({ cls: 'lc-fm__add-item' });
      const ic = item.createSpan({ cls: 'lc-fm__add-item-icon' });
      setIcon(ic, f.icon);
      item.createSpan({ text: f.label });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.draft.rules.push(f.blank());
        this.renderRules();
        menu.remove();
      });
    }
    // Close menu when clicking outside.
    const close = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        activeDocument.removeEventListener('click', close, true);
      }
    };
    // Defer so the current click that opened the menu doesn't also close it.
    activeWindow.setTimeout(() => activeDocument.addEventListener('click', close, true), 0);
  }

  private renderFooter(parent: HTMLElement): void {
    const footer = parent.createDiv({ cls: 'lc-fm__footer' });

    // Save as Smart List — stubbed; disabled with tooltip.
    const saveBtn = footer.createEl('button', {
      cls: 'lc-fm__save',
      attr: { disabled: 'true', title: 'Smart lists coming in a future release' },
    });
    const saveIc = saveBtn.createSpan({ cls: 'lc-fm__save-icon' });
    setIcon(saveIc, 'bookmark-plus');
    saveBtn.createSpan({ text: 'Save as Smart List' });

    const rightGroup = footer.createDiv({ cls: 'lc-fm__footer-right' });

    const resetBtn = rightGroup.createEl('button', { cls: 'lc-fm__reset' });
    const resetIc = resetBtn.createSpan({ cls: 'lc-fm__reset-icon' });
    setIcon(resetIc, 'rotate-ccw');
    resetBtn.createSpan({ text: 'Reset' });
    resetBtn.addEventListener('click', () => {
      this.draft = { match: 'all', rules: [] };
      this.onOpen(); // full re-render
    });

    const applyBtn = rightGroup.createEl('button', {
      cls: 'lc-fm__apply mod-cta',
      text: 'Apply',
    });
    applyBtn.addEventListener('click', () => {
      // If no rules, pass null so the caller can clear the filter entirely.
      this.onApply(this.draft.rules.length === 0 ? null : this.draft);
      this.close();
    });
  }
}
