'use strict';

let dataset;
let currentPatient;
let detailRequest = 0;
let dirty = false;
const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 1) => value == null ? '—' : new Intl.NumberFormat('cs-CZ', {maximumFractionDigits: digits}).format(value);
const signed = (value) => value == null ? '—' : `${value > 0 ? '+' : ''}${fmt(value)}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const confidence = {distinct:'Mimo interval', borderline:'Hraniční kandidát', limited:'Malá opora diagnózy', typical:'V rámci očekávání', insufficient:'Nelze hodnotit'};
const statuses = {unreviewed:'Neposouzeno', relevant:'Klinicky zajímavé', not_relevant:'Nezajímavé', data_issue:'Chyba dat'};
const concerns = {index:'Počátek okna', followup:'Úplnost sledování', diagnosis:'Diagnóza', age:'Věk', sex:'Pohlaví', endpoint:'Výsledek péče'};
const badge = (label, cls) => `<span class="badge ${escapeHtml(cls)}">${escapeHtml(label)}</span>`;

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Požadavek se nezdařil.');
  return result;
}

async function refresh() {
  dataset = await request('/api/analysis');
  renderOverview();
  renderGroups();
  renderMethod();
}

function renderOverview() {
  const s = dataset.summary;
  $('#nav-count').textContent = s.candidates;
  const stats = [
    ['Pacientů v kohortě', s.patients, `${fmt(s.episodes, 0)} epizod péče`, '◉', ''],
    ['Srovnatelné roční okno', s.eligible, `${s.patients - s.eligible} případů s omezením`, '▤', ''],
    ['Kandidátů k posouzení', s.candidates, `${s.outside_interval} mimo predikční interval`, '↗', 'accent'],
    ['Odborně posouzeno', s.reviewed, 'Hodnocení uložená v tomto zařízení', '✓', ''],
  ];
  $('#stats').innerHTML = stats.map(([label, value, note, icon, cls]) => `<article class="stat ${cls}"><div class="stat-label">${label}<span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`).join('');
  $('#context-numbers').innerHTML = `<div class="context-numbers"><span>Malá opora stejné diagnózy</span><strong>${dataset.patients.filter(r => r.assessable && r.support < 5).length}</strong></div><div class="context-numbers"><span>Laboratoř dostupná v celém souboru</span><strong>${s.labs_patients} / ${s.patients}</strong></div>`;
  renderScatter();
  renderRows();
}

function renderScatter() {
  const rows = dataset.patients.filter(r => r.assessable);
  const max = Math.ceil(Math.max(...rows.flatMap(r => [r.expected, r.observed]), 50) / 25) * 25;
  const x = v => 57 + v / max * 560;
  const y = v => 245 - v / max * 213;
  const ticks = Array.from({length:5}, (_, i) => max * i / 4);
  $('#scatter').innerHTML = `<svg viewBox="0 0 650 285" role="group" aria-label="Očekávané a skutečné dny péče. Detail lze otevřít také z tabulky.">
    ${ticks.map(t => `<line x1="57" y1="${y(t)}" x2="617" y2="${y(t)}" stroke="#e9ede5"/><text x="45" y="${y(t)+3}" text-anchor="end">${fmt(t,0)}</text><text x="${x(t)}" y="263" text-anchor="middle">${fmt(t,0)}</text>`).join('')}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(max)}" y2="${y(max)}" stroke="#9ead9b" stroke-dasharray="4 4"/>
    <text x="57" y="16">Skutečnost (dny)</text><text x="617" y="281" text-anchor="end">Očekávání (dny)</text>
    ${rows.slice().reverse().map(r => `<circle class="point" data-patient="${r.patient_id}" cx="${x(r.expected)}" cy="${y(r.observed)}" r="${r.candidate ? 5.5 : 3.5}" fill="${r.candidate ? (r.residual > 0 ? '#b76843' : '#4b7ba4') : '#bfccba'}" role="button" tabindex="0" aria-label="${r.patient_id}: očekávání ${fmt(r.expected)}, skutečnost ${r.observed} dnů"><title>${r.patient_id} · ${r.diagnosis} · odchylka ${signed(r.residual)} dnů</title></circle>`).join('')}
  </svg>`;
}

function filteredRows() {
  const search = $('#search').value.trim().toLowerCase();
  return dataset.patients.filter(r => {
    const scope = $('#scope').value, direction = $('#direction').value, review = $('#review-filter').value;
    return (!search || `${r.patient_id} ${r.diagnosis}`.toLowerCase().includes(search)) &&
      (scope === 'all' || (scope === 'candidates' ? r.candidate : !r.assessable)) &&
      (direction === 'all' || (r.residual != null && (direction === 'higher' ? r.residual > 0 : r.residual < 0))) &&
      (review === 'all' || (review === 'active' ? ['unreviewed','relevant'].includes(r.review.status) : r.review.status === review));
  });
}

function renderRows() {
  const rows = filteredRows();
  $('#result-count').textContent = `(${rows.length})`;
  $('#case-rows').innerHTML = rows.length ? rows.map(r => `<tr>
    <td><button class="patient-link" data-patient="${r.patient_id}">${r.patient_id}</button><small>${r.diagnosis}</small></td>
    <td>${r.age} let<small>${r.sex === 'F' ? 'Ženské' : 'Mužské'} pohlaví</small></td>
    <td>${fmt(r.expected)} dnů<small>interval ${fmt(r.interval[0])}–${fmt(r.interval[1])}</small></td>
    <td>${fmt(r.observed,0)} ${r.observed == null ? '' : 'dnů'}${!r.assessable ? '<small>neúplné / neověřené</small>' : ''}</td>
    <td class="delta ${r.residual > 0 ? 'positive' : 'negative'}">${signed(r.residual)}${r.residual == null ? '' : ' dnů'}<small>${r.percentile == null ? 'bez pořadí' : `${fmt(r.percentile,0)}. percentil překvapivosti`}</small></td>
    <td>${badge(confidence[r.confidence],r.confidence)}<small>${r.support} dalších se stejnou diagnózou</small></td>
    <td>${badge(statuses[r.review.status],r.review.status)}</td><td><button class="row-arrow" data-patient="${r.patient_id}" aria-label="Detail ${r.patient_id}">↗</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty">Žádný případ neodpovídá filtrům. Zkuste celou kohortu nebo všechna hodnocení.</td></tr>';
}

function renderGroups() {
  $('#group-cards').innerHTML = dataset.groups.length ? dataset.groups.map(g => `<article class="panel group-card"><div class="eyebrow">${g.id} · ${g.members.length === 1 ? 'JEDNOTLIVÝ PŘÍPAD' : `${g.members.length} PŘÍPADŮ`}</div><h2>${g.title}</h2><div class="big-number">${signed(g.median_residual)} <small>dnů</small></div><p>Medián odchylky od očekávání</p>${g.comparisons.map(c => `<div class="group-metric">${c.label}: <strong>${fmt(c.median)}</strong><small>medián srovnatelné kohorty ${fmt(c.cohort)}</small></div>`).join('')}<p>Diagnózy: ${Object.entries(g.diagnoses).map(([k,v]) => `${k} (${v})`).join(', ')}</p><div class="members">${g.members.map(id => `<button data-patient="${id}">${id}</button>`).join('')}</div></article>`).join('') : '<div class="panel empty">Žádní aktivní kandidáti pro tvorbu skupin.</div>';
}

function renderMethod() {
  const s = dataset.summary;
  const quality = [...new Set(dataset.patients.flatMap(r => r.quality))].map(q => [q,dataset.patients.filter(r => r.quality.includes(q)).length]);
  $('#method-content').innerHTML = `<div class="method-grid">
    <article class="panel method-card"><h2>01 / Co považujeme za výsledek</h2><p>Počet unikátních dnů v epizodách s koncem po začátku. Překrývající se pobyty počítáme jednou; používáme interval [začátek, konec). Jednodenní hospitalizace od ambulancí v souboru nerozeznáme.</p><p>Okno 365 dnů začíná první epizodou s diagnózou shodnou s nádorovým registrem. Nejde o doložené datum diagnózy ani začátek léčby. Pozdější kontakt alespoň 371 dnů od indexu je jen zástupná podmínka dostupného sledování, nikoli důkaz úplného záchytu péče.</p></article>
    <article class="panel method-card"><h2>02 / Jak vzniká očekávání</h2><p>Aditivní ridge regrese s pevnou penalizací ${s.ridge}: diagnóza, věková skupina a pohlaví. Předpověď omezujeme na 0–365 dnů. Hodnocený pacient nikdy není použit pro svůj vlastní odhad ani kalibraci intervalu.</p><p>Příspěvky charakteristik jsou přesný rozklad vůči průměru trénovací kohorty a dohromady dávají predikci. Laboratoř a průběh péče popisují pozorování; nejsou vstupem predikce. Příspěvek není důkaz příčiny.</p></article>
    <article class="panel method-card"><h2>03 / Ověření na vynechaných pacientech</h2><div class="metric-pair"><div><strong>${fmt(s.mae)}</strong><span>MAE modelu · dnů</span></div><div><strong>${fmt(s.naive_mae)}</strong><span>MAE průměru kohorty · dnů</span></div></div><p>Průměrná absolutní chyba na stejných ${s.eligible} případech, vždy bez příslušného pacienta v trénovací množině. Pokrytí intervalem v této kohortě: ${fmt(s.coverage*100)} %. Vývojové ověření na jednom souboru; externí klinická validace chybí.</p></article>
    <article class="panel method-card"><h2>04 / Nejistota a výběr kandidátů</h2><p>Jackknife+ s α = 0,05; pro každého hodnoceného pacienta kalibrace na ostatních pomocí dalšího vynechání jednoho pacienta. Metoda má dolní mez marginálního pokrytí 90 % za předpokladu zaměnitelnosti pacientů. To nezaručuje pokrytí každé diagnózy ani spolehlivost po výběru extrémů.</p><p>Skóre = |skutečnost − očekávání| / polovinu šířky intervalu (nejméně 1 den). Kandidáti jsou horních 10 % skóre nebo případy mimo interval. Percentil není pravděpodobnost onemocnění ani p-hodnota. „Mimo interval“ vyžaduje alespoň pět jiných pacientů se stejnou diagnózou a stejný závěr při posunu indexu ±3 dny.</p></article>
    <article class="panel method-card"><h2>05 / Kvalita a dostupnost dat</h2><ul>${quality.map(([q,n]) => `<li>${escapeHtml(q)}: <strong>${n}</strong></li>`).join('')}<li>Laboratoř: ${s.labs} výsledků u ${s.labs_patients} pacientů v celém souboru; v ročním okně může chybět.</li></ul><p>Chybějící hodnota není normální nález. Laboratorní kódy bez číselníku nepojmenováváme. Příznaky L/N/H přebíráme ze zdroje, reference mohou být dospělé a hodnoty na mezi detekce nejsou označené. Stadium, TNM, léčba ani úmrtí nevstupují do modelu.</p></article>
    <article class="panel method-card"><h2>06 / Co udělá hodnocení klinika</h2><p>„Klinicky zajímavé“ ponechá případ mezi kandidáty. „Nezajímavé“ jej skryje z výchozí fronty a vyřadí ze shlukování. „Chyba dat“ navíc vyřadí pacienta z trénovací i kalibrační kohorty a přepočítá všechny výsledky. Samotné označení zpochybněné charakteristiky vstup nepřepisuje.</p><p>Komentář, stav i zpochybněné údaje se ukládají lokálně do SQLite a jsou součástí CSV. Návrat na „Neposouzeno“ účinek hodnocení vrátí. Hodnocení jsou svázána s otiskem vstupních dat.</p></article>
    <article class="panel method-card wide"><h2>Podklady a otázky pro mentora</h2><p>Je první epizoda se shodnou diagnózou přijatelný index? Jsou v souboru veškeré pobyty, nebo může nižší zátěž znamenat péči jinde? Má smysl společná reference pro různá nádorová onemocnění? Které ze zaznamenaných komplikací jsou klinicky podstatné?</p><p><a href="https://github.com/olexamatej/rakathon-knowledgebase" target="_blank" rel="noreferrer">Týmová knowledgebase</a> · <a href="https://arxiv.org/abs/1905.02928" target="_blank" rel="noreferrer">Barber a kol.: Predictive inference with the jackknife+</a></p><p>Model ${s.model_version} · otisk dat ${s.fingerprint}. Žádné externí fonty, analytika ani modelové API. Pseudonymizovaná data a odvozené exporty nesdílet mimo schválené prostředí; po hackathonu je odstranit podle pravidel zadání.</p></article></div>`;
}

function showView(view) {
  for (const name of ['overview','groups','method']) $(`#${name}-view`).hidden = name !== view;
  document.querySelectorAll('nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = {overview:'Přehled případů', groups:'Skupiny odchylek', method:'Model a kvalita dat'}[view];
  window.scrollTo(0,0);
}

async function openPatient(id) {
  if (dirty && !confirm('Zahodit neuložené změny hodnocení?')) return;
  dirty = false;
  const requestId = ++detailRequest;
  if (!$('#patient-dialog').open) $('#patient-dialog').showModal();
  $('#patient-content').innerHTML = '<h2 id="patient-title">Načítám detail…</h2>';
  try {
    const row = await request(`/api/patients/${encodeURIComponent(id)}`);
    if (requestId !== detailRequest) return;
    currentPatient = row;
    renderPatient(row);
  } catch (error) { if (requestId === detailRequest) $('#patient-content').textContent = error.message; }
}

function renderPatient(r) {
  const delta = r.residual == null ? 'Výsledek nelze spolehlivě porovnat.' : `Zaznamenaná zátěž je o ${fmt(Math.abs(r.residual))} dnů ${r.residual > 0 ? 'vyšší' : 'nižší'} než očekávání.`;
  const outsideText = !r.assessable ? 'Případ není zařazen do pořadí ani trénování.' : r.outside_interval ? `Skutečnost leží mimo interval. Při posunu indexu ±3 dny je závěr ${r.stable ? 'stabilní' : 'nestabilní'}.` : 'Skutečnost leží uvnitř predikčního intervalu; vysoké pořadí samo o sobě nepotvrzuje odchylku.';
  $('#patient-content').innerHTML = `<div class="patient-heading"><div><h2 id="patient-title">${r.patient_id}</h2><p>${r.diagnosis} &nbsp; · &nbsp; ${r.age} let &nbsp; · &nbsp; ${r.sex === 'F' ? 'Ženské' : 'Mužské'} pohlaví</p></div>${badge(confidence[r.confidence], r.confidence)}</div>
    ${r.quality.length ? `<ul class="quality-list">${r.quality.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>` : ''}
    ${r.review.status === 'data_issue' ? '<div class="quality-list">Označeno klinikem jako chyba dat; případ je vyřazen z reference i pořadí.</div>' : ''}
    <div class="detail-stats"><div class="detail-stat"><span>Očekávaná zátěž</span><strong>${fmt(r.expected)} <small>dnů</small></strong></div><div class="detail-stat"><span>${r.assessable ? 'Skutečná zátěž' : 'Doložené minimum / neověřeno'}</span><strong>${fmt(r.observed,0)} <small>dnů</small></strong></div><div class="detail-stat"><span>Odchylka</span><strong>${signed(r.residual)} <small>${r.residual == null ? '' : 'dnů'}</small></strong></div></div>
    <div class="uncertainty"><strong>${delta}</strong><br>Predikční interval ${fmt(r.interval[0])}–${fmt(r.interval[1])} dnů. ${outsideText}<br>Dalších pacientů se stejnou diagnózou v referenci: <strong>${r.support}</strong>. ${r.support < 5 ? 'U této diagnózy je odhad slabě podložený.' : ''}</div>
    <div class="detail-grid"><section><h3>Co utváří očekávání</h3><p>Přesný rozklad modelu v jednotkách dnů vůči průměru jeho trénovací kohorty.</p><div class="contribution"><span>Výchozí průměr</span><strong>${fmt(r.baseline)} dnů</strong></div>${r.contributions.map(c => `<div class="contribution"><span>${c.label} ${escapeHtml(c.value)}</span><strong>${signed(c.days)}</strong></div>`).join('')}<div class="contribution"><strong>Výsledné očekávání</strong><strong>${fmt(r.expected)} dnů</strong></div><p>Tyto příspěvky vysvětlují model, nikoli biologickou příčinu odchylky.</p></section>
    <section><h3>Čím se průběh liší</h3><p>Srovnání: ${r.peer_group}. Charakteristiky jsou následná pozorování, ne předléčebné prognostické faktory.</p><table class="detail-table"><thead><tr><th>Charakteristika</th><th>Pacient</th><th>Medián reference</th></tr></thead><tbody>${r.evidence.map(e => `<tr><td>${e.label}</td><td>${r.anchor == null ? '—' : fmt(e.actual)}</td><td>${fmt(e.peer_median)}</td></tr>`).join('')}</tbody></table></section></div>
    <h3>První rok péče</h3><p>Index v původní časové ose: ${fmt(r.anchor,0)}. Doložený rozsah po indexu: ${fmt(r.followup,0)} dnů. ${r.sensitivity.length ? `Zátěž při posunu indexu −3 / +3 dny: ${r.sensitivity.join(' / ')} dnů.` : ''}</p><div id="timeline"></div>
    <details><summary>Epizody a hlavní diagnózy (${r.timeline.length})</summary><div class="lab-table"><table class="detail-table"><thead><tr><th>Epizoda</th><th>Začátek od indexu</th><th>Konec</th><th>Diagnóza</th></tr></thead><tbody>${r.timeline.map(e => `<tr><td>${escapeHtml(e.episode_id)}</td><td>${e.start}</td><td>${e.end == null ? 'chybí' : e.end}</td><td>${escapeHtml(e.diagnosis || 'neuvedena')}</td></tr>`).join('')}</tbody></table></div></details>
    <h3>Laboratoř v ročním okně</h3><p>${r.labs_count ? `${r.labs_count} měření; ${r.labs_abnormal} zdrojových příznaků L/H z ${r.labs_with_reference} výsledků s referencí.` : 'Žádné dostupné měření. Z nepřítomnosti dat nelze usuzovat na normální nález.'} Kódy metod jsou bez ověřeného číselníku. Referenční meze nemusí odpovídat dětskému věku.</p>
    ${r.labs.length ? `<details><summary>Zobrazit laboratorní výsledky</summary><div class="lab-table"><table class="detail-table"><thead><tr><th>Den</th><th>Kód / panel</th><th>Hodnota</th><th>Reference</th><th>Příznak</th></tr></thead><tbody>${r.labs.map(l => `<tr><td>${l.day}</td><td>${escapeHtml(l.test_code)}<small>${escapeHtml(l.panel)}</small></td><td>${fmt(l.value,3)} ${escapeHtml(l.unit)}</td><td>${fmt(l.ref_low,3)}–${fmt(l.ref_high,3)}</td><td>${escapeHtml(l.flag || '—')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    <form id="review-form" class="review-form"><h3>Váš klinický pohled</h3><label for="review-status">Závěr posouzení</label><select id="review-status">${Object.entries(statuses).map(([value,label]) => `<option value="${value}" ${r.review.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><fieldset><legend>Zpochybněné údaje k ověření</legend><div class="checkboxes">${Object.entries(concerns).map(([key,label]) => `<label><input type="checkbox" name="concern" value="${key}" ${(r.review.concerns || []).includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset><label for="review-note">Komentář nebo alternativní vysvětlení</label><textarea id="review-note" maxlength="4000" placeholder="Co je klinicky zajímavé? Co je potřeba ověřit v dokumentaci?">${escapeHtml(r.review.note)}</textarea><div class="form-footer"><p>„Chyba dat“ vyřadí případ z reference a přepočítá model. „Nezajímavé“ vyřadí případ z výchozí fronty a skupin. Hodnocení zůstane v exportu.</p><button type="submit" class="button primary">Uložit posouzení</button></div><div id="review-message" class="review-message" role="status"></div></form>`;
  renderTimeline(r);
  $('#review-form').addEventListener('input', () => { dirty = true; });
  $('#review-form').addEventListener('submit', saveReview);
}

function renderTimeline(r) {
  if (r.anchor == null) { $('#timeline').textContent = 'Bez indexu nelze zobrazit roční průběh.'; return; }
  const x = day => 25 + Math.max(0, Math.min(365, day)) / 365 * 710;
  $('#timeline').innerHTML = `<svg class="timeline" viewBox="0 0 760 100" role="img" aria-label="Časová osa pobytů a jednodenních kontaktů"><line x1="25" y1="65" x2="735" y2="65" stroke="#cad8c4"/>${[0,90,180,270,365].map(d => `<text x="${x(d)}" y="85" text-anchor="middle">${d}. den</text>`).join('')}${r.timeline.map(e => e.end == null ? `<path d="M ${x(e.start)-3} 33 l 6 6 m -6 0 l 6 -6" stroke="#aa6542"><title>Chybí konec · ${e.diagnosis}</title></path>` : e.end > e.start ? `<rect x="${x(e.start)}" y="23" width="${Math.max(2,x(e.end)-x(e.start))}" height="20" rx="2" fill="#69866a" opacity=".75"><title>${e.diagnosis}: ${e.start}–${e.end}</title></rect>` : `<circle cx="${x(e.start)}" cy="58" r="2.5" fill="#a6b6a1"><title>${e.diagnosis}: den ${e.start}</title></circle>`).join('')}<text x="25" y="13">Vícedenní pobyty (pruhy) · jednodenní kontakty (body) · chybějící konec (křížek)</text></svg>`;
}

async function saveReview(event) {
  event.preventDefault();
  const button = $('#review-form button[type=submit]');
  button.disabled = true;
  $('#review-message').textContent = 'Ukládám a přepočítávám…';
  let saved = false;
  try {
    const review = await request('/api/reviews', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      patient_id:currentPatient.patient_id, status:$('#review-status').value, note:$('#review-note').value,
      concerns:[...document.querySelectorAll('[name=concern]:checked')].map(e => e.value),
      previous_updated_at:currentPatient.review.updated_at,
    })});
    saved = true;
    dirty = false;
    currentPatient.review = review;
    await refresh();
    currentPatient = await request(`/api/patients/${currentPatient.patient_id}`);
    renderPatient(currentPatient);
    $('#review-message').textContent = 'Posouzení uloženo. Pořadí a skupiny jsou aktualizované.';
  } catch (error) {
    $('#review-message').textContent = `${saved ? 'Hodnocení je uloženo, ale přehled se nepodařilo obnovit. ' : ''}${error.message}`;
    button.disabled = false;
  }
}

document.addEventListener('click', event => {
  const patient = event.target.closest('[data-patient]');
  if (patient) openPatient(patient.dataset.patient);
  const view = event.target.closest('[data-view]');
  if (view) showView(view.dataset.view);
});
document.addEventListener('keydown', event => {
  if (event.target.matches('circle[data-patient]') && ['Enter',' '].includes(event.key)) {
    event.preventDefault(); openPatient(event.target.dataset.patient);
  }
});
$('#search').addEventListener('input', () => {if (dataset) renderRows();});
for (const selector of ['#scope','#direction','#review-filter']) $(selector).addEventListener('change', () => {if (dataset) renderRows();});
$('#review-filter').addEventListener('change', () => {
  if ($('#review-filter').value === 'data_issue') {$('#scope').value = 'all'; $('#direction').value = 'all'; renderRows();}
});
$('#scope').addEventListener('change', () => {
  if ($('#scope').value === 'insufficient') {$('#review-filter').value = 'all'; $('#direction').value = 'all'; renderRows();}
});
function closeDialog(event) {
  if (dirty && !confirm('Zahodit neuložené změny hodnocení?')) {event?.preventDefault();return;}
  dirty = false;
  detailRequest++;
  $('#patient-dialog').close();
}
$('#close-dialog').addEventListener('click', closeDialog);
$('#patient-dialog').addEventListener('cancel', closeDialog);
window.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault();event.returnValue = '';}});
$('#notice').textContent = 'Načítám lokální kohortu…';
refresh().then(() => {$('#notice').textContent = '';}).catch(error => {$('#notice').textContent = `Data se nepodařilo načíst: ${error.message} Obnovte stránku po spuštění serveru.`;});
