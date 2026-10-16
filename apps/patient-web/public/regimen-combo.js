import { loadRegimens } from './services.js';

const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Autocomplete for oncology regimen names on a plain <input>; `list` is an empty <ul hidden>.
export function attachRegimenCombo(input, list, { limit = 30 } = {}) {
  let suggestions = [];
  let active = -1;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  list.setAttribute('role', 'listbox');

  function hide() {
    list.hidden = true;
    list.replaceChildren();
    suggestions = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
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
    input.value = name;
    hide();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function show() {
    const query = normalize(input.value.trim());
    if (!query) return hide();
    const names = await loadRegimens();
    if (normalize(input.value.trim()) !== query) return;
    const starts = [];
    const contains = [];
    for (const name of names) {
      const index = normalize(name).indexOf(query);
      if (index === 0) starts.push(name);
      else if (index > 0) contains.push(name);
      if (starts.length >= limit) break;
    }
    suggestions = [...starts, ...contains].slice(0, limit);
    if (!suggestions.length || (suggestions.length === 1 && suggestions[0] === input.value.trim())) return hide();
    list.replaceChildren(...suggestions.map((name, i) => {
      const option = document.createElement('li');
      option.id = `${list.id}-option-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = name;
      option.dataset.name = name;
      return option;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  }

  input.addEventListener('input', () => void show());
  input.addEventListener('focus', () => void loadRegimens());
  input.addEventListener('blur', hide);
  input.addEventListener('keydown', event => {
    const open = !list.hidden;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) return void show();
      event.preventDefault();
      setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation(); // keep a surrounding <dialog> open
      hide();
    }
  });
  // mousedown keeps focus in the input so blur does not hide the list before the pick registers.
  list.addEventListener('mousedown', event => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    event.preventDefault();
    pick(option.dataset.name);
  });
  return { hide };
}
