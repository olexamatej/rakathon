const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// One floating suggestion list shared by any number of inputs. The list is `position: fixed` so it is
// not clipped by scrolling tables; pass a <dialog> as `container` when the inputs live inside one.
// Suggestions never restrict the value: the input keeps whatever the user typed.
export function createAutocomplete({ getOptions, container = document.body, id, limit = 30, minWidth = 280 }) {
  const list = document.createElement('ul');
  list.id = id;
  list.className = 'suggestions';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  container.append(list);

  const normalized = new WeakMap(); // options array -> normalized copies, computed once
  let input = null;
  let suggestions = [];
  let active = -1;
  let suppress = false;

  function hide() {
    list.hidden = true;
    list.replaceChildren();
    suggestions = [];
    active = -1;
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
  }

  function place() {
    const rect = input.getBoundingClientRect();
    list.style.left = `${rect.left}px`;
    list.style.top = `${rect.bottom + 4}px`;
    list.style.width = `${Math.max(rect.width, minWidth)}px`;
  }

  function setActive(index) {
    const options = list.querySelectorAll('[role="option"]');
    active = options.length ? (index + options.length) % options.length : -1;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function pick(name) {
    const target = input;
    hide();
    suppress = true; // setting the value must not reopen the list
    target.value = name;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    suppress = false;
  }

  async function show(source) {
    input = source;
    const query = normalize(input.value.trim());
    if (!query) return hide();
    const options = await getOptions();
    if (input !== source || normalize(source.value.trim()) !== query) return;
    if (!normalized.has(options)) normalized.set(options, options.map(normalize));
    const folded = normalized.get(options);
    const starts = [];
    const contains = [];
    for (let i = 0; i < options.length && starts.length < limit; i++) {
      const index = folded[i].indexOf(query);
      if (index === 0) starts.push(options[i]);
      else if (index > 0 && contains.length < limit) contains.push(options[i]);
    }
    suggestions = [...new Set([...starts, ...contains])].slice(0, limit);
    if (!suggestions.length || (suggestions.length === 1 && suggestions[0] === source.value.trim())) return hide();
    list.replaceChildren(...suggestions.map((name, i) => {
      const option = document.createElement('li');
      option.id = `${id}-option-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = name;
      option.dataset.name = name;
      return option;
    }));
    place();
    list.hidden = false;
    source.setAttribute('aria-expanded', 'true');
    active = -1;
  }

  function bind(source) {
    source.setAttribute('role', 'combobox');
    source.setAttribute('aria-autocomplete', 'list');
    source.setAttribute('aria-controls', id);
    source.setAttribute('aria-expanded', 'false');
    source.addEventListener('input', () => { if (!suppress) void show(source); });
    source.addEventListener('focus', () => { input = source; void getOptions(); });
    source.addEventListener('blur', () => { if (input === source) hide(); });
    source.addEventListener('keydown', event => {
      if (input !== source) input = source;
      const open = !list.hidden;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!open) return void show(source);
        event.preventDefault();
        setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && open && active >= 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pick(suggestions[active]);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopImmediatePropagation(); // keep a surrounding <dialog> open and do not revert the cell
        hide();
      }
    });
  }

  // mousedown keeps focus in the input so blur does not hide the list before the pick registers.
  list.addEventListener('mousedown', event => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    event.preventDefault();
    pick(option.dataset.name);
  });
  window.addEventListener('scroll', () => { if (!list.hidden) hide(); }, true);
  window.addEventListener('resize', hide);
  return { bind, hide };
}
