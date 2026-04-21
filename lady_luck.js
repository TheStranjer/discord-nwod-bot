const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RandomOrg = require('random-org');
const { Client, Intents } = require('discord.js');

const storedResultsDir = 'stored_results';
if (!fs.existsSync(storedResultsDir)) {
	fs.mkdirSync(storedResultsDir, { recursive: true });
}

function tokenHashFor(token) {
	return crypto.createHash('sha256').update(token).digest('hex').slice(0, 7);
}

function storedResultsPath(hash, die) {
	return path.join(storedResultsDir, `${hash}_${die}.json`);
}

const localeConfigPath = 'locales.json';
const defaultLocaleConfig = {
	default_locale: 'en',
	server_locales: {},
	user_locales: {}
};

function normalizeLocaleMap(localeMap) {
	if (!localeMap || typeof localeMap !== 'object') {
		return {};
	}
	const normalized = {};
	for (const [key, value] of Object.entries(localeMap)) {
		if (typeof value === 'string' && value.trim() !== '') {
			normalized[key] = value.toLowerCase();
		}
	}
	return normalized;
}

function normalizeLocaleConfig(config) {
	const normalized = {
		default_locale: 'en',
		server_locales: {},
		user_locales: {}
	};
	if (!config || typeof config !== 'object') {
		return normalized;
	}
	if (typeof config.default_locale === 'string' && config.default_locale.trim() !== '') {
		normalized.default_locale = config.default_locale.toLowerCase();
	}
	normalized.server_locales = normalizeLocaleMap(config.server_locales);
	normalized.user_locales = normalizeLocaleMap(config.user_locales);
	return normalized;
}

let localeConfig = defaultLocaleConfig;
function loadLocaleConfig() {
	let parsed = null;
	if (fs.existsSync(localeConfigPath)) {
		try {
			const raw = fs.readFileSync(localeConfigPath, 'utf8');
			if (raw && raw.trim().length > 0) {
				parsed = JSON.parse(raw);
			}
		} catch (err) {
			parsed = null;
		}
	}
	const normalized = normalizeLocaleConfig(parsed);
	localeConfig = normalized;
	if (!fs.existsSync(localeConfigPath) || parsed == null) {
		fs.writeFileSync(localeConfigPath, JSON.stringify(localeConfig, null, 2));
	}
}

loadLocaleConfig();

const availableLocales = new Set(
	fs.readdirSync('locales')
		.filter(file => file.endsWith('.json'))
		.map(file => path.basename(file, '.json'))
);
const localeCache = {};

function loadLocale(localeKey) {
	if (!localeKey) {
		return null;
	}
	const normalized = localeKey.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(localeCache, normalized)) {
		return localeCache[normalized];
	}
	const localePath = `locales/${normalized}.json`;
	if (!fs.existsSync(localePath)) {
		localeCache[normalized] = null;
		return null;
	}
	try {
		localeCache[normalized] = JSON.parse(fs.readFileSync(localePath, 'utf8'));
	} catch (err) {
		localeCache[normalized] = null;
	}
	return localeCache[normalized];
}

function saveLocaleConfig() {
	fs.writeFile(localeConfigPath, JSON.stringify(localeConfig, null, 2), function () {});
}

function uniqueList(values) {
	const seen = new Set();
	return values.filter(value => {
		if (!value || seen.has(value)) {
			return false;
		}
		seen.add(value);
		return true;
	});
}

function getDefaultLocaleChain() {
	return uniqueList([localeConfig.default_locale, 'en']);
}

function getLocaleChainForMsg(msg) {
	const chain = [];
	if (msg && msg.author && localeConfig.user_locales && localeConfig.user_locales[msg.author.id]) {
		chain.push(localeConfig.user_locales[msg.author.id]);
	}
	if (msg && msg.guild && localeConfig.server_locales && localeConfig.server_locales[msg.guild.id]) {
		chain.push(localeConfig.server_locales[msg.guild.id]);
	}
	chain.push(localeConfig.default_locale);
	chain.push('en');
	return uniqueList(chain);
}

function getLocaleValue(localeData, key) {
	const parts = key.split('.');
	let value = localeData;
	for (const part of parts) {
		if (!value || !Object.prototype.hasOwnProperty.call(value, part)) {
			return null;
		}
		value = value[part];
	}
	return typeof value === 'string' ? value : null;
}

function t(key, vars, localeChain) {
	const chain = Array.isArray(localeChain)
		? localeChain
		: (localeChain ? [localeChain] : getDefaultLocaleChain());
	let value = null;
	for (const localeKey of chain) {
		const localeData = loadLocale(localeKey);
		if (!localeData) {
			continue;
		}
		value = getLocaleValue(localeData, key);
		if (typeof value === 'string') {
			break;
		}
	}
	if (typeof value !== 'string') {
		return key;
	}
	if (!vars) {
		return value;
	}
	return value.replace(/\{(\w+)\}/g, function (match, name) {
		return vars[name] == null ? match : String(vars[name]);
	});
}

function tMsg(msg, key, vars) {
	return t(key, vars, getLocaleChainForMsg(msg));
}

console.log(t('console.startup_title'));
console.log(t('console.startup_description'));
console.log(t('console.startup_author'));

var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'));
var wc = JSON.parse(fs.readFileSync('wc.json', 'utf8'));
var random = new RandomOrg({ apiKey: auth.random, endpoint: 'https://api.random.org/json-rpc/2/invoke' });
var trueAdmins = auth.trueAdmins || [];
var clients = [];

var dicePools = { d10: {}, d12: {} };
var dicePoolsSnapshot = { d10: {}, d12: {} };

function loadPool(hash, die) {
	const file = storedResultsPath(hash, die);
	if (fs.existsSync(file)) {
		try {
			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch (err) {
			// ignore, start fresh
		}
	}
	return [];
}

function ensureTokenPools(hash) {
	if (!dicePools.d10[hash]) {
		dicePools.d10[hash] = loadPool(hash, 'd10');
		dicePoolsSnapshot.d10[hash] = dicePools.d10[hash].slice();
	}
	if (!dicePools.d12[hash]) {
		dicePools.d12[hash] = loadPool(hash, 'd12');
		dicePoolsSnapshot.d12[hash] = dicePools.d12[hash].slice();
	}
}

const isAdmin = member => member.permissions.has("ADMINISTRATOR");
const randInt = (min,max) => min + Math.round(Math.random() * (max - min));
const isTrueAdmin = id => trueAdmins.includes(id);

function sendLongMessage(channel, content) {
        const chunks = content.match(/[^]{1,1900}/g) || [];
        for (const chunk of chunks) {
                channel.send(chunk);
        }
}

function d10(tokenHash) {
	if (tokenHash) {
		ensureTokenPools(tokenHash);
		const ret = dicePools.d10[tokenHash].pop();
		return typeof ret == 'undefined' ? randInt(1, 10) : ret;
	}
	return randInt(1, 10);
}

function d12(tokenHash) {
	if (tokenHash) {
		ensureTokenPools(tokenHash);
		const ret = dicePools.d12[tokenHash].pop();
		return typeof ret == 'undefined' ? randInt(1, 12) : ret;
	}
	return randInt(1, 12);
}

function unique(value, index, self) {
	return self.indexOf(value) === index;
}

function d10RefillCheck(tokenHash) {
	if (!tokenHash) return;
	ensureTokenPools(tokenHash);
	if (dicePools.d10[tokenHash].length < 100) {
		console.log(t('console.d10_refill_start', { count: dicePools.d10[tokenHash].length }));
		random.generateIntegers({ min: 1, max: 10, n: 100 }).then(function (result) {
			dicePools.d10[tokenHash] = dicePools.d10[tokenHash].concat(result.random.data);
			console.log(t('console.d10_refill_done', { count: dicePools.d10[tokenHash].length }));
		});
	}
}

function d12RefillCheck(tokenHash) {
	if (!tokenHash) return;
	ensureTokenPools(tokenHash);
	if (dicePools.d12[tokenHash].length < 100) {
		random.generateIntegers({ min: 1, max: 12, n: 100 }).then(function (result) {
			dicePools.d12[tokenHash] = dicePools.d12[tokenHash].concat(result.random.data);
		});
	}
}

function dav20Roll(pool, difficulty, options, localeChain, tokenHash) {
	const optionsArray = options ? options.toLowerCase().split('').filter(unique) : [];

	var outcome = {
		results: [],
		errors: [],
		pool: parseInt(pool),
		botching: !optionsArray.some(opt => opt == 'n'),
		willpower: optionsArray.some(opt => opt == 'w'),
		specialty: optionsArray.some(opt => opt == 's'),
		difficulty: parseInt(difficulty)
	};

	if (isNaN(outcome.pool) || outcome.pool > 25 || outcome.pool < 1) {
		outcome.errors.push(t('dav20.errors.pool_range', null, localeChain));
	}

	if (isNaN(outcome.difficulty) || outcome.difficulty > 10 || outcome.difficulty < 1) {
		outcome.errors.push(t('dav20.errors.difficulty_range', null, localeChain));
	}

	for (var i = 0; i < pool; i++) {
		outcome.results.push(d10(tokenHash));
	}

	d10RefillCheck(tokenHash);

	outcome.botches = outcome.botching ? outcome.results.filter(res => res == 1).length : 0;
	outcome.hits = outcome.results.filter(res => res >= difficulty).length;
	outcome.successes = outcome.hits - outcome.botches;
	outcome.successes += outcome.specialty ? outcome.results.filter(res => res == 10).length : 0;
	outcome.successes = outcome.willpower ? Math.max(outcome.successes + 1, 1) : outcome.successes;

	return outcome;
}

function nwodRoll(pool, options='', localeChain, tokenHash) {
	var again = 10;
	var rote = false;
	var botching = false;

	for (const char of options) {
		switch (char) {
			case '8':
				again = 8;
				break;
			case '9':
				again = 9;
				break;
			case 'r':
				rote = true
				break;
			case 'b':
				botching = true;
				break;
			case 'n':
				again = 11;
				break;
		}
	}

	var outcome = {
		errors: [],
		successes: 0,
		results: [],
		pool: parseInt(pool),
		again: again,
		rote: rote,
		botching: botching
	};

	if (isNaN(outcome.pool)) {
		outcome.errors.push(t('nwod.errors.pool_nan', null, localeChain));
	}

	if (isNaN(outcome.again)) {
		outcome.errors.push(t('nwod.errors.again_nan', null, localeChain))
	} else if (outcome.again < 8) {
		outcome.errors.push(t('nwod.errors.again_low', null, localeChain));
	}
	
	if (outcome.pool > 25) {
		outcome.errors.push(t('nwod.errors.pool_high', null, localeChain));
	}

	if (outcome.errors.length) {
		return outcome;
	}

	if (pool < 1) {
		var result = null;
		while (true) {
			result = d10(tokenHash);

			outcome.results.push(result);

			if (result != 10) {
				break;
			}

			outcome.successes++;
		}

		d10RefillCheck(tokenHash);

		return outcome;
	}

	for (i = 0; i < pool; i++) {
		var free_rerolls = rote ? 1 : 0; // will start out 0 if rote action isn't enabled
		do {
			var result = d10(tokenHash);
			if (result >= 8) {
				outcome.successes++;
			} else if (result == 1 && botching) {
				outcome.successes--;
			}
			outcome.results.push(result);
		} while (result >= outcome.again || free_rerolls-- > 0);
	}

	d10RefillCheck(tokenHash);
	
	return outcome;
}

function suxxToWords(suxx, localeChain) {
	return suxx
	  ? t('nwod.successes', { count: suxx, suffix: suxx == 1 ? '' : 'es' }, localeChain)
	  : t('nwod.no_success', null, localeChain);
}

function againToWords(again, localeChain) {
	return again == 10
	  ? ''
	  : (again < 10 ? t('nwod.again_suffix', { again: again }, localeChain) : t('nwod.no_rerolls', null, localeChain));
}

function dav20ToText(outcome, localeChain) {
	if (outcome.errors.length > 0) {
		return t('dav20.error_prefix', null, localeChain) + outcome.errors.join("; ");
	}

	const prettyResults = outcome.results.map(function (res) {
		if (res >= outcome.difficulty) {
			return `**${res}**`;
		}

		if (outcome.botching && res == 1) {
			return `~~${res}~~`;
		}

		return `${res}`;
	});

	var outcomeType = '';
	if (outcome.successes > 1) {
		outcomeType = t('dav20.outcome.multi_success', { count: outcome.successes }, localeChain);
	} else if (outcome.successes == 1) {
		outcomeType = t('dav20.outcome.single_success', null, localeChain);
	} else if (outcome.botches > 0 && outcome.hits == 0) {
		outcomeType = t('dav20.outcome.botch', null, localeChain);
	} else {
		outcomeType = t('dav20.outcome.failure', null, localeChain);
	}

	notes = [];

	if (!outcome.botching) {
		notes.push(t('dav20.notes.no_botches', null, localeChain));
	}

	if (outcome.willpower) {
		notes.push(t('dav20.notes.willpower', null, localeChain));
	}

	if (outcome.specialty) {
		notes.push(t('dav20.notes.specialty', null, localeChain));
	}

	return t('dav20.text', {
		outcome: outcomeType,
		pool: outcome.pool,
		difficulty: outcome.difficulty,
		results: prettyResults.join(', '),
		options: notes.length > 0 ? notes.join(', ') : t('dav20.options_none', null, localeChain)
	}, localeChain);
}

function nwodToText(outcome, localeChain) {
	if (outcome.errors.length > 0) {
		return t('nwod.error_prefix', null, localeChain) + outcome.errors.join("; ");
	} else if (outcome.pool < 1) {
		return t('nwod.chance_roll', {
			successes: suxxToWords(outcome.successes, localeChain),
			results: outcome.results.join(', ')
		}, localeChain);
	}

	var newResults = outcome.results;

	for (const i in newResults) {
		if (newResults[i] >= outcome.again) {
			newResults[i] = "**_" + newResults[i] + "_**";
		} else if (newResults[i] >= 8) {
			newResults[i] = "**" + newResults[i] + "**";
		} else if (outcome.botching && newResults[i] == 1) {
			newResults[i] == "~~1~~";
		}
	}
	
	notes = [];
	if (outcome.again == 8 || outcome.again == 9) {
		notes.push(t('nwod.notes.again', { again: outcome.again }, localeChain));
	}
	if (outcome.botching) {
		notes.push(t('nwod.notes.botch', null, localeChain));
	}
	if (outcome.rote) {
		notes.push(t('nwod.notes.rote', null, localeChain));
	}
	if (outcome.again == 11) {
		notes.push(t('nwod.notes.no_rerolls', null, localeChain));
	}

	return t('nwod.roll', {
		pool: outcome.pool,
		notes: notes.length > 0 ? ' (' + notes.join(", ") + ')' : '',
		successes: suxxToWords(outcome.successes, localeChain),
		results: newResults.join(', ')
	}, localeChain);
}

function generateTableContent(initTable, localeChain) {
	var ret = t('initiative.table_header', null, localeChain);

	var chars = initTable.characters;

	var keys = Object.keys(chars);
	keys.sort(function (a, b) { return chars[b] - chars[a] });

	var padLength = chars[keys[0]].toString().length;

	for (const charIndex in keys) {
		charName = keys[charIndex];
		var forcesText = (initTable.forces[charName] ? t('initiative.forced_by', { name: initTable.forces[charName] }, localeChain) : "");
		ret += chars[charName].toString().padStart(padLength) + " : " + charName + forcesText + "\n";
	}

	ret += t('initiative.table_footer', null, localeChain);

	return ret;
}

function nwodInitForceToText(msg, val, name, localeChain) {
	if (!/^\d+$/.test(val)) {
		msg.reply(t('initiative.force_error', null, localeChain));
		return;
	}

	if (!name) {
		name = msg.member ? msg.member.nickname : msg.author.username;
	}

	var channelId = msg["channel"].id;
	if (!initTables[channelId]) {
		initTables[channelId] = { characters: {}, forces: {} };
	}

	initTables[channelId].characters[name] = val;
	initTables[channelId].forces[name] = name;

	var tableContent = generateTableContent(initTables[channelId], localeChain);
	if (initTables[channelId].msg) {
		initTables[channelId].msg.delete();
	}

	msg.channel.send(tableContent).then(function(tableMsg) {
		initTables[channelId].msg = tableMsg;
	});
	
}

function nwodInitToText(msg, offset, name, localeChain, tokenHash) {
	if (!/^\d+$/.test(offset)) {
		offset = 0;
	} else {
		offset = Number(offset);
	}

	if (!name) {
		name = msg.member ? msg.member.nickname : msg.author.username;
	}


	var roll = d10(tokenHash);
	d10RefillCheck(tokenHash);
	var channelId = msg["channel"].id;
	var content = t('initiative.roll', { name: name, roll: roll, offset: offset, total: roll + offset }, localeChain);
	msg.reply(content).then(function (notificationMsg) {
		if (!initTables[channelId]) {
			initTables[channelId] = { characters: {}, forces: {} };
		}

		initTables[channelId].characters[name] = roll + offset;

		var tableContent = generateTableContent(initTables[channelId], localeChain);
		if (initTables[channelId].msg) {
			initTables[channelId].msg.delete();
		}

		msg.channel.send(tableContent).then(function(tableMsg) {
			initTables[channelId].msg = tableMsg;
		});
	});
}

function nwodInitClear(msg, localeChain) {
	var channelId = msg["channel"].id;
	msg.reply(t('initiative.cleared', null, localeChain));
	initTables[channelId] = { characters: {}, forces: {} };
}

function on_ready(client) {
	console.log(t('console.logged_in', { tag: this.user.tag }));
}


function wcRem(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only'));
		return;
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply(tMsg(msg, 'wordcount.channel_missing'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	if (wc[guild.id].listen_channels.includes(channel_id)) {
		wc[guild.id].listen_channels = wc[guild.id].listen_channels.filter(function (val, ind) {
			return val != channel_id;
		});
		msg.reply(tMsg(msg, 'wordcount.channel_removed', { name: channel.name }));

		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	} else {
		msg.reply(tMsg(msg, 'wordcount.channel_not_listed', { name: channel.name }));
	}
}

function wcAdd(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only_lower'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply(tMsg(msg, 'wordcount.channel_missing_lower'));
		return;
	}

	if (wc[guild.id].listen_channels.includes(channel_id)) {
		msg.reply(tMsg(msg, 'wordcount.channel_already_added'));
	} else {
		wc[guild.id].listen_channels.push(channel_id);
		msg.reply(tMsg(msg, 'wordcount.channel_added', { name: channel.name }));
		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	}
}

function wcList(msg) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channels = guild.channels.cache.filter(chan => wc[guild.id].listen_channels.includes(chan.id)).array();

	if (channels.length == 0) {
		msg.reply(tMsg(msg, 'wordcount.no_wordcount_channels'));
		return;
	}

	var reply = tMsg(msg, 'wordcount.list_header');

	for (i = 0; i < channels.length; i++) {
		reply += channels[i].name + "\n";
	}

	msg.reply(reply);
}

function wcOOC(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only_lower'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply(tMsg(msg, 'wordcount.channel_missing_lower'));
		return;
	}

	wc[guild.id].ooc_channel = channel.id;

	msg.reply(tMsg(msg, 'wordcount.ooc_set', { name: channel.name }));
}

function wordCount(prose) {
	let length = prose.match(/[\w'’]+/gi);
	length = length == null ? 0 : length.length;
	return length;
}

function wcRA(msg, role_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only_lower'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null, "roles" : [] };
	}
	
	guild.roles.fetch(role_id).then(role => {
		if (role == null) {
			msg.reply(tMsg(msg, 'wordcount.role_missing'));
			return;
		}
	
		if (wc[guild.id].roles == null) {
			wc[guild.id].roles = [];
		}
	
		if (wc[guild.id].roles.includes(role_id)) {
			msg.reply(tMsg(msg, 'wordcount.role_already_added'));
		} else {
			wc[guild.id].roles.push(role_id);
			msg.reply(tMsg(msg, 'wordcount.role_added', { name: role.name }));
			fs.writeFile('wc.json', JSON.stringify(wc), function () {});
		}
	});
}

function wcRR(msg, role_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only_lower'));
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null, "roles" : [] };
	}
	
	guild.roles.fetch(role_id).then(role => {
		wc[guild.id].roles = wc[guild.id].roles.filter(function (val, ind) { return val != role_id });

		msg.reply(tMsg(msg, 'wordcount.role_removed', { name: role ? role.name : role_id }));

		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	});

}
function wordCountConsider(msg) {
	var guild = msg.guild;
	if (guild == null) {
		return;
	}

	var channel = msg.channel;
	var localeChain = getLocaleChainForMsg(msg);

	if (wc[guild.id] == null || !wc[guild.id].listen_channels.includes(channel.id.toString())) {
		return;
	}

	var roles = msg.member.roles.cache.array();

	if (wc[guild.id].roles == null || msg.member.roles.cache.every(function (role) { return !wc[guild.id].roles.includes(role.id); })) {
		return;
	}

	var ooc_channel = guild.channels.cache.find(chan => chan.id == wc[guild.id].ooc_channel);

	if (ooc_channel == null) {
		return;
	}

	if (wc[guild.id].word_count_reward == null) {
		wc[guild.id].word_count_reward = 50;
	}

	if (wc[guild.id].users == null) {
		wc[guild.id].users = {};
	}

	if (wc[guild.id].users[msg.author.id] == null) {
		wc[guild.id].users[msg.author.id] = {
			word_count: 0,
			bonus_points: 0
		};
	}

	var wordCountCalc = wordCount(msg.content);
	var wordCountTotal = wc[guild.id].users[msg.author.id].word_count + wordCountCalc;
	var reward = Math.floor(wordCountTotal / wc[guild.id].word_count_reward);

	wc[guild.id].users[msg.author.id].word_count = wordCountTotal - (wc[guild.id].word_count_reward * reward);
	wc[guild.id].users[msg.author.id].bonus_points += reward;

	if (!wc[guild.id].users[msg.author.id].last_sent) {
		wc[guild.id].users[msg.author.id].last_sent = 0;
	}
	
	var now = Math.floor(Date.now() / 1000);

	if (reward > 0 && now > wc[guild.id].users[msg.author.id].last_sent) {
		ooc_channel.send(t('wordcount.ooc_award', {
			user: msg.author.toString(),
			words: wordCountCalc,
			reward: reward,
			total: wc[guild.id].users[msg.author.id].bonus_points
		}, localeChain));
		wc[guild.id].users[msg.author.id].last_sent = now + 3600;
	}
	
	fs.writeFile('wc.json', JSON.stringify(wc), function () {});
}

function wcForce(msg, user_id, bp_total, wc_total) {
	if (user_id == null || isNaN(user_id)) {
		msg.reply(tMsg(msg, 'wordcount.force_user_missing'));
		return;
	}

	if (bp_total == null || isNaN(bp_total) ) {
		msg.reply(tMsg(msg, 'wordcount.force_bp_invalid'));
		return;
	}

	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply(tMsg(msg, 'wordcount.admin_only_lower'));
		return;
	}

	var user = guild.members.cache.array().filter(member => member.user.id == user_id)[0];

	if (user == null) {
		msg.reply(tMsg(msg, 'wordcount.user_missing'));
		return;
	}

	if (wc[guild.id].users == null) {
		wc[guild.id].users = {};
	}

	if (wc[guild.id].users[user.id] == null) {
		wc[guild.id].users[user.id] = {
			bonus_points: 0,
			word_count: 0
		};
	}

	wc[guild.id].users[user.id].bonus_points = parseInt(bp_total);

	if (wc_total != null && !isNaN(wc_total)) {
		wc[guild.id].users[user.id].word_count = parseInt(wc_total);
	}

	msg.reply(tMsg(msg, 'wordcount.force_confirm', {
		user: user.toString(),
		points: wc[guild.id].users[user.id].bonus_points,
		count: wc[guild.id].users[user.id].word_count
	}))

	fs.writeFile('wc.json', JSON.stringify(wc), function () {});
}

function wcShow(msg, user_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply(tMsg(msg, 'wordcount.guild_only_lower'));
		return;
	}

	var user = user_id == null || isNaN(user_id) ? msg.author : guild.members.cache.array().filter(member => member.user.id == parseInt(user_id))[0].user;

	if (wc[guild.id] == null) {
		wc[guild.id] = { };
	}

	if (wc[guild.id].users == null) {
		wc[guild.id].users = {};
	}

	if (wc[guild.id].users[user.id] == null) {
		wc[guild.id].users[user.id] = {
			bonus_points: 0,
			word_counts: 0
		};
	}

	var bonus_points = wc[guild.id].users[user.id].bonus_points;
	var word_count = wc[guild.id].users[user.id].word_count;

	if (bonus_points == null || bonus_points == 0) {
		bonus_points = "no";
	}

	if (word_count == null || word_count == 0) {
		word_count = "no";
	}

	msg.reply(tMsg(msg, 'wordcount.status', {
		user: user.toString(),
		points: wc[guild.id].users[user.id].bonus_points,
		count: wc[guild.id].users[user.id].word_count
	}));
}

async function handle_message(msg, tokenHash) {
	const words = msg.content.split(/\s+/);
	const command = words[0].toLowerCase();
	const localeChain = getLocaleChainForMsg(msg);

	switch (command) {
		case '!nwod':
			const nWoDoutcome = nwodToText(nwodRoll(words[1], words[2], localeChain, tokenHash), localeChain);
			console.log(t('console.roll_nwod', {
				user: `${msg.author.username}#${msg.author.discriminator}`,
				outcome: nWoDoutcome
			}, localeChain));
			msg.reply(nWoDoutcome);
			break;
		case '!dav20':
			const dav20outcome = dav20ToText(dav20Roll(words[1], words[2], words[3], localeChain, tokenHash), localeChain);
			console.log(t('console.roll_dav20', {
				user: `${msg.author.username}#${msg.author.discriminator}`,
				outcome: dav20outcome
			}, localeChain));
			msg.reply(dav20outcome);
			break;
		case '!init':
			nwodInitToText(msg, words[1], words[2], localeChain, tokenHash);
			break;
		case '!initforce':
			nwodInitForceToText(msg, words[1], words[2], localeChain);
			break;
		case '!initclear':
			nwodInitClear(msg, localeChain);
			break;
		case '!server-language': {
			if (!msg.guild) {
				msg.reply(t('locales.guild_only', null, localeChain));
				break;
			}
			const guildOwnerId = msg.guild.ownerId || msg.guild.ownerID;
			if (!isAdmin(msg.member) && guildOwnerId !== msg.author.id) {
				msg.reply(t('locales.admin_only', null, localeChain));
				break;
			}
			const requestedLocale = words[1] ? words[1].toLowerCase() : '';
			if (!requestedLocale) {
				msg.reply(t('locales.missing_locale', null, localeChain));
				break;
			}
			if (!availableLocales.has(requestedLocale)) {
				msg.reply(t('locales.unknown_locale', { locales: Array.from(availableLocales).sort().join(', ') }, localeChain));
				break;
			}
			localeConfig.server_locales = localeConfig.server_locales || {};
			localeConfig.server_locales[msg.guild.id] = requestedLocale;
			saveLocaleConfig();
			msg.reply(t('locales.server_set', { locale: requestedLocale }, getLocaleChainForMsg(msg)));
			break;
		}
		case '!language': {
			const requestedLocale = words[1] ? words[1].toLowerCase() : '';
			if (!requestedLocale) {
				msg.reply(t('locales.missing_locale', null, localeChain));
				break;
			}
			if (!availableLocales.has(requestedLocale)) {
				msg.reply(t('locales.unknown_locale', { locales: Array.from(availableLocales).sort().join(', ') }, localeChain));
				break;
			}
			localeConfig.user_locales = localeConfig.user_locales || {};
			localeConfig.user_locales[msg.author.id] = requestedLocale;
			saveLocaleConfig();
			msg.reply(t('locales.user_set', { locale: requestedLocale }, getLocaleChainForMsg(msg)));
			break;
		}
		case '!wc-add':
			wcAdd(msg, words[1]);
			break;
		case '!wc-rem':
			wcRem(msg, words[1]);
			break;
		case '!wc-ooc':
			wcOOC(msg, words[1]);
			break;
		case '!wc-ra':
			wcRA(msg, words[1]);
			break;
		case '!wc-rr':
			wcRR(msg, words[1]);
			break;
		case '!wc-list':
			wcList(msg);
			break;
		case '!wc-force':
			wcForce(msg, words[1], words[2], words[3]);
			break;
                case '!wc':
                        wcShow(msg, words[1]);
                        break;
                case '!guilds':
                        if (!isTrueAdmin(msg.author.id)) break;
                        var guildNames = [];
                        for (const client of clients) {
                                client.guilds.cache.forEach(guild => {
                                        guildNames.push(`${guild.name} (${guild.id})`);
                                });
                        }
                        sendLongMessage(msg.channel, guildNames.join('\n') || t('admin_tools.no_guilds', null, localeChain));
                        break;
                case '!channels':
                        if (!isTrueAdmin(msg.author.id)) break;
                        const guildId = words[1];
                        var guildFound = false;
                        for (const client of clients) {
                                const guild = client.guilds.cache.get(guildId);
                                if (guild) {
                                        guildFound = true;
                                        var channelNames = [];
                                        guild.channels.cache.filter(ch => ch.type === 'text' || ch.type === 'GUILD_TEXT').forEach(ch => {
                                                const category = ch.parent;
                                                const categoryInfo = category ? ` - ${category.name} (${category.id})` : '';
                                                channelNames.push(`${ch.name} (${ch.id})${categoryInfo}`);
                                        });
                                        sendLongMessage(msg.channel, channelNames.join('\n') || t('admin_tools.no_channels', null, localeChain));
                                        break;
                                }
                        }
                        if (!guildFound) {
                                msg.reply(t('admin_tools.guild_not_found', null, localeChain));
                        }
                        break;
                case '!say':
                        if (!isTrueAdmin(msg.author.id)) break;
                        const channelId = words[1];
                        const possibleId = words[2];
                        const hasMessageId = /^\d{10,}$/.test(possibleId);
                        const messageId = hasMessageId ? possibleId : null;
                        const sayMessage = hasMessageId ? words.slice(3).join(' ') : words.slice(2).join(' ');
                        const files = Array.from(msg.attachments.values()).map(att => ({ attachment: att.url, name: att.name }));
                        var channelFound = false;
                        var messageFound = false;
                        var sent = false;
                        for (const client of clients) {
                                const channel = client.channels.cache.get(channelId);
                                if (channel) {
                                        channelFound = true;
                                        if (messageId) {
                                                try {
                                                        const target = await channel.messages.fetch(messageId);
                                                        const options = { content: sayMessage };
                                                        if (files.length > 0) {
                                                                options.files = files;
                                                        }
                                                        await target.reply(options);
                                                        messageFound = true;
                                                        sent = true;
                                                } catch (err) {
                                                        // ignore fetch errors
                                                }
                                        } else {
                                                const options = { content: sayMessage };
                                                if (files.length > 0) {
                                                        options.files = files;
                                                }
                                                await channel.send(options);
                                                sent = true;
                                        }
                                        break;
                                }
                        }
                        if (!channelFound) {
                                msg.reply(t('admin_tools.channel_not_found', null, localeChain));
                        } else if (messageId && !messageFound) {
                                msg.reply(t('admin_tools.message_not_found', null, localeChain));
                        } else if (sent) {
                                msg.reply(t('admin_tools.message_sent', null, localeChain));
                        }
                        break;
                case '!read':
                        if (!isTrueAdmin(msg.author.id)) break;
                        const readChannelId = words[1];
                        var located = false;
                        for (const client of clients) {
                                const channel = client.channels.cache.get(readChannelId);
                                if (channel) {
                                        located = true;
                                        channel.messages.fetch({ limit: 100 }).then(messages => {
                                                const ordered = Array.from(messages.values()).reverse();
                                                var output = '';
                                               for (const m of ordered) {
                                                       const timestamp = m.createdAt ? m.createdAt.toISOString() : new Date(m.createdTimestamp).toISOString();
                                                       const line = `${timestamp} (${m.id}) ${m.author.username}: ${m.content}`;
                                                       if (output.length + line.length + 1 > 1900) {
                                                               msg.channel.send(output);
                                                               output = '';
                                                       }
                                                       output += line + '\n';
                                               }
                                                if (output.length > 0) {
                                                        msg.channel.send(output);
                                                }
                                        });
                                        break;
                                }
                        }
                        if (!located) {
                                msg.reply(t('admin_tools.channel_not_found', null, localeChain));
                        }
                        break;
        }

	wordCountConsider(msg);
}

for (const token of auth.token) {
        const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
        const hash = tokenHashFor(token);
        ensureTokenPools(hash);
        clients.push(client);
        process.stdout.write(t('console.logging_in'));
        client.on('message', (msg) => handle_message(msg, hash));
        client.on('ready', on_ready);
        client.login(token);
        d10RefillCheck(hash);
        d12RefillCheck(hash);
}

initTables = {};

var minute = 1000 * 60;

function arraysEqual(a, b) {
	if (a === b) return true;
	if (!a || !b || a.length !== b.length) return false;
	for (var i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

setInterval(function () {
	var changed = false;
	for (const die of ['d10', 'd12']) {
		for (const hash of Object.keys(dicePools[die])) {
			if (!arraysEqual(dicePoolsSnapshot[die][hash], dicePools[die][hash])) {
				fs.writeFileSync(storedResultsPath(hash, die), JSON.stringify(dicePools[die][hash]));
				dicePoolsSnapshot[die][hash] = dicePools[die][hash].slice();
				changed = true;
			}
		}
	}
	if (changed) {
		console.log(t('console.stored_results_update'));
	}
}, minute);
