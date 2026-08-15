(function () {
	'use strict';

	var FORMAT_ID = 'gen9custombalance';
	var PREFIX = 'CB1';
	var TYPES = [
		'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
		'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'
	];
	var STATS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
	var NATURES = [
		['Hardy', '', ''], ['Lonely', 'atk', 'def'], ['Brave', 'atk', 'spe'], ['Adamant', 'atk', 'spa'], ['Naughty', 'atk', 'spd'],
		['Bold', 'def', 'atk'], ['Docile', '', ''], ['Relaxed', 'def', 'spe'], ['Impish', 'def', 'spa'], ['Lax', 'def', 'spd'],
		['Timid', 'spe', 'atk'], ['Hasty', 'spe', 'def'], ['Serious', '', ''], ['Jolly', 'spe', 'spa'], ['Naive', 'spe', 'spd'],
		['Modest', 'spa', 'atk'], ['Mild', 'spa', 'def'], ['Quiet', 'spa', 'spe'], ['Bashful', '', ''], ['Rash', 'spa', 'spd'],
		['Calm', 'spd', 'atk'], ['Gentle', 'spd', 'def'], ['Sassy', 'spd', 'spe'], ['Careful', 'spd', 'spa'], ['Quirky', '', '']
	];
	var NATURE_MAP = Object.create(null);
	NATURES.forEach(function (entry) { NATURE_MAP[entry[0]] = { plus: entry[1], minus: entry[2] }; });
	var panel = null;
	var lastEditor = null;
	var lastSet = null;

	function blankData() {
		return { type1: '', type2: 'default', baseStats: {} };
	}
	function normalizeCode(value) {
		return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	}
	function decode(value) {
		value = normalizeCode(value);
		if (!value || value.slice(0, 3) !== PREFIX) return blankData();
		var payload = value.slice(3);
		if (!/^\d{22}$/.test(payload)) return blankData();
		var t1 = Number(payload.slice(0, 2));
		var t2 = Number(payload.slice(2, 4));
		if (t1 > TYPES.length || t2 > TYPES.length + 1) return blankData();
		var data = blankData();
		data.type1 = t1 ? TYPES[t1 - 1] : '';
		data.type2 = t2 === TYPES.length + 1 ? 'none' : t2 ? TYPES[t2 - 1] : 'default';
		STATS.forEach(function (entry, i) {
			var n = Number(payload.slice(4 + i * 3, 7 + i * 3));
			if (n) data.baseStats[entry[0]] = n;
		});
		return data;
	}
	function pad(value, length) {
		return String(value).padStart(length, '0');
	}
	function encode(data) {
		var t1 = data.type1 ? TYPES.indexOf(data.type1) + 1 : 0;
		var t2 = data.type2 === 'none' ? TYPES.length + 1 : data.type2 === 'default' ? 0 : TYPES.indexOf(data.type2) + 1;
		var out = PREFIX + pad(t1, 2) + pad(t2, 2);
		STATS.forEach(function (entry) { out += pad(data.baseStats[entry[0]] || 0, 3); });
		return out;
	}
	function speciesFor(editor, set) {
		return editor.dex.species.get(set.species);
	}
	function getSP(set, stat) {
		return set.evs && set.evs[stat] !== undefined ? Number(set.evs[stat]) : 0;
	}
	function getIV(set, stat) {
		return set.ivs && set.ivs[stat] !== undefined ? Number(set.ivs[stat]) : 31;
	}
	function totalSP(set) {
		return STATS.reduce(function (sum, entry) { return sum + getSP(set, entry[0]); }, 0);
	}
	function effectiveBaseStats(editor, set, data) {
		var species = speciesFor(editor, set);
		var result = {};
		STATS.forEach(function (entry) {
			result[entry[0]] = data.baseStats[entry[0]] || species.baseStats[entry[0]];
		});
		return result;
	}
	function effectiveTypes(editor, set, data) {
		var species = speciesFor(editor, set);
		var type1 = data.type1 || species.types[0];
		var type2 = data.type2 === 'none' ? '' : data.type2 === 'default' ? (species.types[1] || '') : data.type2;
		if (type2 === type1) type2 = '';
		return [type1, type2].filter(Boolean);
	}
	function natureModifier(set, stat) {
		var nature = NATURE_MAP[set.nature || 'Serious'];
		if (!nature) return 1;
		if (nature.plus === stat) return 1.1;
		if (nature.minus === stat) return 0.9;
		return 1;
	}
	function finalStat(set, bases, stat) {
		var level = Number(set.level || 50);
		var base = bases[stat];
		var iv = getIV(set, stat);
		var spContribution = Math.max(2 * getSP(set, stat) - 1, 0);
		if (stat === 'hp') {
			if (base === 1) return 1;
			return Math.trunc((2 * base + iv + spContribution + 100) * level / 100) + level + 10;
		}
		var result = Math.trunc((2 * base + iv + spContribution) * level / 100) + 5;
		return Math.trunc(result * natureModifier(set, stat));
	}
	function save(editor) {
		editor.save();
		if (typeof editor.update === 'function') editor.update();
	}
	function numInput(value, min, max, width) {
		var el = document.createElement('input');
		el.type = 'number';
		el.inputMode = 'numeric';
		el.min = String(min);
		el.max = String(max);
		el.step = '1';
		el.value = value === undefined ? '' : String(value);
		el.className = 'textbox inputform numform';
		el.style.width = width || '52px';
		return el;
	}
	function typeSelect(value, second) {
		var el = document.createElement('select');
		el.className = 'select';
		var baseOptions = second ? [['default', 'Species default'], ['none', 'None']] : [['', 'Species default']];
		baseOptions.forEach(function (entry) {
			var option = document.createElement('option');
			option.value = entry[0]; option.textContent = entry[1]; el.appendChild(option);
		});
		TYPES.forEach(function (type) {
			var option = document.createElement('option');
			option.value = type; option.textContent = type; el.appendChild(option);
		});
		el.value = value;
		return el;
	}
	function natureSelect(value) {
		var el = document.createElement('select');
		el.className = 'select';
		NATURES.forEach(function (entry) {
			var option = document.createElement('option');
			option.value = entry[0]; option.textContent = entry[0]; el.appendChild(option);
		});
		el.value = value || 'Serious';
		return el;
	}
	function cell(text) {
		var el = document.createElement('td');
		if (text !== undefined) el.textContent = String(text);
		return el;
	}

	function decorateLegalityBuckets(editor, search) {
		if (!search || !search.typedSearch || editor.format !== FORMAT_ID) return;
		var type = search.typedSearch.searchType;
		if (type !== 'move' && type !== 'ability') return;

		var label = type === 'move' ? 'Illegal moves (allowed)' : 'Illegal abilities (allowed)';
		var results = search.results || [];
		for (var i = 0; i < results.length; i++) {
			if (results[i][0] === 'header' && results[i][1] === 'Illegal results') {
				results[i][1] = label;
				return;
			}
		}

		if (search.query) return;
		var illegal = search.typedSearch.baseIllegalResults;
		if (!illegal || !illegal.length) return;

		var illegalResults = illegal.slice();
		if (search.sortCol && typeof search.typedSearch.sort === 'function') {
			illegalResults = illegalResults.filter(function (row) { return row[0] === type; });
			illegalResults = search.typedSearch.sort(illegalResults, search.sortCol, search.reverseSort);
		}
		search.results = results.concat([['header', label]], illegalResults);
	}

	function patchSearch(editor) {
		var search = editor.search;
		if (!search || search.customBalanceLegalityBuckets) return;
		var originalFind = search.find.bind(search);
		search.find = function (query) {
			var changed = originalFind(query);
			decorateLegalityBuckets(editor, search);
			return changed;
		};
		search.customBalanceLegalityBuckets = true;

		if (search.results) {
			var query = search.query || '';
			search.results = null;
			search.find(query);
			if (search.resultsComponent && typeof search.resultsComponent.forceUpdate === 'function') {
				search.resultsComponent.forceUpdate();
			}
		}
	}

	function patchNativeUI(editor, set, data) {
		var types = effectiveTypes(editor, set, data);
		var typeHost = document.querySelector('.team-focus-editor .set-details .border-collapse > div');
		if (typeHost) {
			if (window.Dex && typeof window.Dex.getTypeIcon === 'function') {
				typeHost.innerHTML = types.map(function (type) { return window.Dex.getTypeIcon(type) + ' '; }).join('');
			} else {
				typeHost.textContent = types.join(' / ');
			}
			typeHost.title = 'Custom Balance native typing: ' + types.join(' / ');
		}

		var statsButton = document.querySelector('.team-focus-editor .set-stats button[name="stats"]');
		if (statsButton) {
			statsButton.innerHTML = '<strong>' + totalSP(set) + ' / 66 SP</strong><br><small>Custom Balance</small>';
			statsButton.title = 'Edit Stat Points, IVs, base stats, and Nature in the Custom Balance panel.';
		}

		var nativeStats = document.querySelector('.team-focus-editor [role="dialog"][aria-label="Stats"]');
		if (nativeStats) {
			nativeStats.style.display = 'none';
			nativeStats.setAttribute('aria-hidden', 'true');
		}
		document.querySelectorAll('.team-focus-editor input[name^="ev-"]').forEach(function (input) {
			input.disabled = true;
			input.title = 'Use the Custom Balance Stat Point controls above.';
		});
	}

	function render(editor, set) {
		if (panel) panel.remove();
		var host = document.querySelector('.team-focus-editor .set-form') || document.querySelector('.team-focus-editor');
		if (!host) return;

		var data = decode(set.pokeball);
		var species = speciesFor(editor, set);
		var bases = effectiveBaseStats(editor, set, data);
		var spTotal = totalSP(set);

		panel = document.createElement('div');
		panel.id = 'custom-balance-panel';
		panel.className = 'infobox';
		panel.style.margin = '8px';
		panel.style.maxWidth = '620px';
		panel.innerHTML = '<h3 style="margin-top:0">Custom Balance</h3>' +
			'<p><small><strong>Changes save automatically.</strong> Blank base stats and types use the species default. Stat Points use Champions mechanics: 32 max per stat, 66 total.</small></p>';

		var controls = document.createElement('div');
		controls.style.display = 'flex'; controls.style.flexWrap = 'wrap'; controls.style.gap = '10px 18px';
		var levelLabel = document.createElement('label'); levelLabel.textContent = 'Level: ';
		var level = numInput(set.level || 50, 1, 50, '50px');
		level.onchange = function () {
			var n = Math.max(1, Math.min(50, Number(level.value) || 50));
			set.level = n === 50 ? undefined : n; save(editor); render(editor, set);
		};
		levelLabel.appendChild(level); controls.appendChild(levelLabel);

		var natureLabel = document.createElement('label'); natureLabel.textContent = 'Nature: ';
		var nature = natureSelect(set.nature || 'Serious');
		nature.onchange = function () {
			if (nature.value === 'Serious') delete set.nature;
			else set.nature = nature.value;
			save(editor); render(editor, set);
		};
		natureLabel.appendChild(nature); controls.appendChild(natureLabel);

		var t1Label = document.createElement('label'); t1Label.textContent = 'Type 1: ';
		var t1 = typeSelect(data.type1, false);
		t1.onchange = function () { data.type1 = t1.value; set.pokeball = encode(data); save(editor); render(editor, set); };
		t1Label.appendChild(t1); controls.appendChild(t1Label);
		var t2Label = document.createElement('label'); t2Label.textContent = 'Type 2: ';
		var t2 = typeSelect(data.type2, true);
		t2.onchange = function () { data.type2 = t2.value; set.pokeball = encode(data); save(editor); render(editor, set); };
		t2Label.appendChild(t2); controls.appendChild(t2Label);
		panel.appendChild(controls);

		var typePreview = document.createElement('p');
		typePreview.innerHTML = '<small>Effective native typing: <strong>' + effectiveTypes(editor, set, data).join(' / ') + '</strong></small>';
		panel.appendChild(typePreview);

		var table = document.createElement('table'); table.className = 'table'; table.style.width = '100%';
		var head = document.createElement('tr');
		['Stat', 'Base', 'SP', 'IV', 'Final'].forEach(function (label) { var th = document.createElement('th'); th.textContent = label; head.appendChild(th); });
		table.appendChild(head);
		STATS.forEach(function (entry) {
			var stat = entry[0], row = document.createElement('tr'), th = document.createElement('th'); th.textContent = entry[1]; row.appendChild(th);
			var baseCell = cell(), base = numInput(data.baseStats[stat], 1, 255, '54px');
			base.placeholder = String(species.baseStats[stat]);
			base.title = 'Blank uses species default: ' + species.baseStats[stat];
			base.onchange = function () {
				if (!base.value) delete data.baseStats[stat];
				else data.baseStats[stat] = Math.max(1, Math.min(255, Number(base.value) || species.baseStats[stat]));
				set.pokeball = encode(data); save(editor); render(editor, set);
			};
			baseCell.appendChild(base); row.appendChild(baseCell);

			var spCell = cell(), sp = numInput(getSP(set, stat), 0, 32, '48px');
			sp.onchange = function () {
				var old = getSP(set, stat), n = Math.max(0, Math.min(32, Number(sp.value) || 0));
				var others = spTotal - old;
				n = Math.min(n, Math.max(0, 66 - others));
				set.evs = set.evs || {}; set.evs[stat] = n; save(editor); render(editor, set);
			};
			spCell.appendChild(sp); row.appendChild(spCell);

			var ivCell = cell(), iv = numInput(getIV(set, stat), 0, 31, '48px');
			iv.onchange = function () {
				var n = Number(iv.value); if (!Number.isFinite(n)) n = 31; n = Math.max(0, Math.min(31, n));
				set.ivs = set.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
				set.ivs[stat] = n; save(editor); render(editor, set);
			};
			ivCell.appendChild(iv); row.appendChild(ivCell);
			row.appendChild(cell(finalStat(set, bases, stat))); table.appendChild(row);
		});
		panel.appendChild(table);

		var total = document.createElement('p');
		total.innerHTML = '<strong>Stat Points: ' + spTotal + ' / 66</strong>';
		if (spTotal > 66) {
			total.style.color = '#b00020';
			total.innerHTML += ' <small>Reduce this to 66 or less before validating.</small>';
		}
		panel.appendChild(total);

		var buttons = document.createElement('div'); buttons.style.display = 'flex'; buttons.style.flexWrap = 'wrap'; buttons.style.gap = '6px';
		var reset = document.createElement('button'); reset.className = 'button'; reset.textContent = 'Reset custom typing and base stats';
		reset.onclick = function () { set.pokeball = undefined; save(editor); render(editor, set); }; buttons.appendChild(reset);
		var resetSP = document.createElement('button'); resetSP.className = 'button'; resetSP.textContent = 'Reset Stat Points';
		resetSP.onclick = function () { set.evs = undefined; save(editor); render(editor, set); }; buttons.appendChild(resetSP);
		panel.appendChild(buttons);
		host.insertBefore(panel, host.firstChild);
		patchNativeUI(editor, set, data);
	}

	function tick() {
		var editor = window.editor;
		if (!editor || editor.format !== FORMAT_ID) {
			if (panel) panel.remove(); panel = null; lastEditor = null; lastSet = null; return;
		}
		editor.defaultLevel = 50;
		patchSearch(editor);
		var focus = editor.innerFocus;
		var set = focus && editor.sets && editor.sets[focus.setIndex];
		if (!set) { if (panel) panel.remove(); panel = null; lastSet = null; return; }

		var data = decode(set.pokeball);
		patchNativeUI(editor, set, data);

		var searchOpen = focus && ['pokemon', 'ability', 'item', 'move'].includes(focus.type);
		if (searchOpen) {
			if (panel) panel.remove();
			panel = null;
			lastEditor = editor;
			lastSet = set;
			return;
		}

		if (editor !== lastEditor || set !== lastSet || !document.getElementById('custom-balance-panel')) {
			lastEditor = editor; lastSet = set; render(editor, set);
		}
		var level = document.querySelector('.team-focus-editor input[name="level"]');
		if (level) { level.max = '50'; level.placeholder = '50'; }
	}
	setInterval(tick, 250);
})();