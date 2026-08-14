(function () {
	'use strict';

	var FORMAT_ID = 'gen9custombalance';
	var PREFIX = 'CB1';
	var TYPES = [
		'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
		'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'
	];
	var STATS = [
		['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']
	];
	var lastEditor = null;
	var lastSet = null;
	var panel = null;

	function blankData() {
		return { type1: '', type2: 'default', baseStats: {} };
	}

	function decode(value) {
		if (!value || value.slice(0, PREFIX.length) !== PREFIX) return blankData();
		var payload = value.slice(PREFIX.length);
		if (!/^\d{22}$/.test(payload)) return blankData();
		var type1Code = Number(payload.slice(0, 2));
		var type2Code = Number(payload.slice(2, 4));
		if (type1Code > TYPES.length || type2Code > TYPES.length + 1) return blankData();
		var data = blankData();
		data.type1 = type1Code ? TYPES[type1Code - 1] : '';
		data.type2 = type2Code === TYPES.length + 1 ? 'none' : type2Code ? TYPES[type2Code - 1] : 'default';
		for (var i = 0; i < STATS.length; i++) {
			var stat = Number(payload.slice(4 + i * 3, 7 + i * 3));
			if (stat) data.baseStats[STATS[i][0]] = stat;
		}
		return data;
	}

	function pad(value, length) {
		return String(value).padStart(length, '0');
	}

	function encode(data) {
		var type1 = data.type1 ? TYPES.indexOf(data.type1) + 1 : 0;
		var type2 = data.type2 === 'none' ? TYPES.length + 1 : data.type2 === 'default' ? 0 : TYPES.indexOf(data.type2) + 1;
		var payload = pad(type1, 2) + pad(type2, 2);
		for (var i = 0; i < STATS.length; i++) {
			payload += pad(data.baseStats[STATS[i][0]] || 0, 3);
		}
		return PREFIX + payload;
	}

	function speciesFor(editor, set) {
		return editor.dex.species.get(set.species);
	}

	function getBaseStats(editor, set, data) {
		var species = speciesFor(editor, set);
		var out = {};
		for (var i = 0; i < STATS.length; i++) {
			var id = STATS[i][0];
			out[id] = data.baseStats[id] || species.baseStats[id];
		}
		return out;
	}

	function getTypes(editor, set, data) {
		var species = speciesFor(editor, set);
		var type1 = data.type1 || species.types[0];
		var type2;
		if (data.type2 === 'none') type2 = '';
		else if (data.type2 === 'default') type2 = species.types[1] || '';
		else type2 = data.type2;
		if (type2 === type1) type2 = '';
		return [type1, type2];
	}

	function getIV(set, stat) {
		return set.ivs && set.ivs[stat] !== undefined ? Number(set.ivs[stat]) : 31;
	}

	function getSP(set, stat) {
		return set.evs && set.evs[stat] !== undefined ? Number(set.evs[stat]) : 0;
	}

	function natureModifier(set, stat) {
		var natures = window.BattleNatures || {};
		var nature = natures[set.nature] || null;
		if (!nature) return 1;
		if (nature.plus === stat) return 1.1;
		if (nature.minus === stat) return 0.9;
		return 1;
	}

	function finalStat(editor, set, baseStats, stat) {
		var level = Number(set.level || 50);
		var base = baseStats[stat];
		var iv = getIV(set, stat);
		var equivalentEVs = getSP(set, stat) * 8;
		if (stat === 'hp') {
			if (base === 1) return 1;
			return Math.trunc(Math.trunc(2 * base + iv + Math.trunc(equivalentEVs / 4) + 100) * level / 100 + 10);
		}
		var value = Math.trunc(Math.trunc(2 * base + iv + Math.trunc(equivalentEVs / 4)) * level / 100 + 5);
		return Math.trunc(value * natureModifier(set, stat));
	}

	function save(editor) {
		editor.save();
		if (typeof editor.update === 'function') editor.update();
	}

	function numberInput(value, min, max, width) {
		var input = document.createElement('input');
		input.type = 'number';
		input.inputMode = 'numeric';
		input.min = String(min);
		input.max = String(max);
		input.step = '1';
		input.value = value === undefined ? '' : String(value);
		input.className = 'textbox inputform numform';
		input.style.width = width || '54px';
		return input;
	}

	function typeSelect(value, second) {
		var select = document.createElement('select');
		select.className = 'select';
		var defaults = second ? [['default', 'Species default'], ['none', 'None']] : [['', 'Species default']];
		for (var i = 0; i < defaults.length; i++) {
			var opt = document.createElement('option');
			opt.value = defaults[i][0];
			opt.textContent = defaults[i][1];
			select.appendChild(opt);
		}
		for (var j = 0; j < TYPES.length; j++) {
			var typeOpt = document.createElement('option');
			typeOpt.value = TYPES[j];
			typeOpt.textContent = TYPES[j];
			select.appendChild(typeOpt);
		}
		select.value = value;
		return select;
	}

	function td(text) {
		var cell = document.createElement('td');
		if (text !== undefined) cell.textContent = String(text);
		return cell;
	}

	function renderPanel(editor, set) {
		if (panel) panel.remove();
		panel = document.createElement('div');
		panel.id = 'custom-balance-panel';
		panel.className = 'infobox';
		panel.style.margin = '8px';
		panel.style.maxWidth = '620px';

		var data = decode(set.pokeball);
		var species = speciesFor(editor, set);
		var baseStats = getBaseStats(editor, set, data);
		var types = getTypes(editor, set, data);

		var heading = document.createElement('h3');
		heading.textContent = 'Custom Balance';
		heading.style.marginTop = '0';
		panel.appendChild(heading);

		var note = document.createElement('p');
		note.innerHTML = '<small>These overrides apply only in [Gen 9] Custom Balance. Blank base stats use the species default. Stat Points: 32 max per stat, 66 total.</small>';
		panel.appendChild(note);

		var top = document.createElement('div');
		top.style.display = 'flex';
		top.style.flexWrap = 'wrap';
		top.style.gap = '10px 18px';

		var levelLabel = document.createElement('label');
		levelLabel.textContent = 'Level: ';
		var levelInput = numberInput(set.level || 50, 1, 50, '50px');
		levelInput.addEventListener('change', function () {
			var value = Math.max(1, Math.min(50, Number(levelInput.value) || 50));
			set.level = value === 50 ? undefined : value;
			levelInput.value = String(value);
			save(editor);
			renderPanel(editor, set);
		});
		levelLabel.appendChild(levelInput);
		top.appendChild(levelLabel);

		var type1Label = document.createElement('label');
		type1Label.textContent = 'Type 1: ';
		var type1 = typeSelect(data.type1, false);
		type1.addEventListener('change', function () {
			data.type1 = type1.value;
			set.pokeball = encode(data);
			save(editor);
			renderPanel(editor, set);
		});
		type1Label.appendChild(type1);
		top.appendChild(type1Label);

		var type2Label = document.createElement('label');
		type2Label.textContent = 'Type 2: ';
		var type2 = typeSelect(data.type2, true);
		type2.addEventListener('change', function () {
			data.type2 = type2.value;
			set.pokeball = encode(data);
			save(editor);
			renderPanel(editor, set);
		});
		type2Label.appendChild(type2);
		top.appendChild(type2Label);
		panel.appendChild(top);

		var typePreview = document.createElement('p');
		typePreview.innerHTML = '<small>Effective native typing: <strong>' + types.filter(Boolean).join(' / ') + '</strong></small>';
		panel.appendChild(typePreview);

		var table = document.createElement('table');
		table.className = 'table';
		table.style.width = '100%';
		var header = document.createElement('tr');
		['Stat', 'Base', 'SP', 'IV', 'Final'].forEach(function (name) {
			var th = document.createElement('th');
			th.textContent = name;
			header.appendChild(th);
		});
		table.appendChild(header);

		var totalSP = 0;
		for (var i = 0; i < STATS.length; i++) totalSP += getSP(set, STATS[i][0]);

		STATS.forEach(function (entry) {
			var stat = entry[0];
			var row = document.createElement('tr');
			var name = document.createElement('th');
			name.textContent = entry[1];
			row.appendChild(name);

			var baseCell = td();
			var baseInput = numberInput(data.baseStats[stat], 1, 255, '54px');
			baseInput.placeholder = String(species.baseStats[stat]);
			baseInput.title = 'Blank uses species default: ' + species.baseStats[stat];
			baseInput.addEventListener('change', function () {
				if (!baseInput.value) {
					delete data.baseStats[stat];
				} else {
					data.baseStats[stat] = Math.max(1, Math.min(255, Number(baseInput.value) || species.baseStats[stat]));
				}
				set.pokeball = encode(data);
				save(editor);
				renderPanel(editor, set);
			});
			baseCell.appendChild(baseInput);
			row.appendChild(baseCell);

			var spCell = td();
			var spInput = numberInput(getSP(set, stat), 0, 32, '48px');
			spInput.addEventListener('change', function () {
				var oldValue = getSP(set, stat);
				var value = Math.max(0, Math.min(32, Number(spInput.value) || 0));
				var otherTotal = totalSP - oldValue;
				value = Math.min(value, 66 - otherTotal);
				set.evs = set.evs || {};
				set.evs[stat] = value;
				save(editor);
				renderPanel(editor, set);
			});
			spCell.appendChild(spInput);
			row.appendChild(spCell);

			var ivCell = td();
			var ivInput = numberInput(getIV(set, stat), 0, 31, '48px');
			ivInput.addEventListener('change', function () {
				var value = Math.max(0, Math.min(31, Number(ivInput.value)));
				if (isNaN(value)) value = 31;
				set.ivs = set.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
				set.ivs[stat] = value;
				save(editor);
				renderPanel(editor, set);
			});
			ivCell.appendChild(ivInput);
			row.appendChild(ivCell);

			row.appendChild(td(finalStat(editor, set, baseStats, stat)));
			table.appendChild(row);
		});
		panel.appendChild(table);

		var total = document.createElement('p');
		total.innerHTML = '<strong>Stat Points: ' + totalSP + ' / 66</strong>' + (totalSP > 66 ? ' — too many' : '');
		panel.appendChild(total);

		var reset = document.createElement('button');
		reset.className = 'button';
		reset.textContent = 'Reset custom typing and base stats';
		reset.addEventListener('click', function () {
			set.pokeball = undefined;
			save(editor);
			renderPanel(editor, set);
		});
		panel.appendChild(reset);

		var host = document.querySelector('.team-focus-editor .set-form') || document.querySelector('.team-focus-editor');
		if (host) host.insertBefore(panel, host.firstChild);
	}

	function tick() {
		var editor = window.editor;
		if (!editor || editor.format !== FORMAT_ID) {
			if (panel) panel.remove();
			panel = null;
			lastEditor = null;
			lastSet = null;
			return;
		}
		editor.defaultLevel = 50;
		var focus = editor.innerFocus;
		var set = focus && editor.sets && editor.sets[focus.setIndex];
		if (!set) {
			if (panel) panel.remove();
			panel = null;
			lastSet = null;
			return;
		}
		if (editor !== lastEditor || set !== lastSet || !document.getElementById('custom-balance-panel')) {
			lastEditor = editor;
			lastSet = set;
			renderPanel(editor, set);
		}

		var level = document.querySelector('.team-focus-editor input[name="level"]');
		if (level) {
			level.max = '50';
			level.placeholder = '50';
		}
	}

	setInterval(tick, 250);
})();
