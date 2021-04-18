const fs = require('fs');
const RandomOrg = require('random-org');
const { Client, Intents } = require('discord.js');

console.log("Lady Luck");
console.log("A Discord dicebot with rules ad hoceries");
console.log("The Stranjer\n\n");

var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'));
var wc = JSON.parse(fs.readFileSync('wc.json', 'utf8'));
var random = new RandomOrg({ apiKey: auth.random, endpoint: 'https://api.random.org/json-rpc/2/invoke' });
var d10s = [];

if (fs.existsSync('stored_results.json')) {
	d10s = JSON.parse(fs.readFileSync('stored_results.json', 'utf8'));
}

var d10sold = d10s;

const isAdmin = member => member.hasPermission("ADMINISTRATOR");
const randInt = (min,max) => min + Math.round(Math.random() * (max - min));

function d10() {
	const ret = d10s.pop();
	return typeof ret == 'undefined' ? randInt(1, 10) : ret;
}

function d10RefillCheck() {
	if (d10s.length < 100) {
		console.log(`d10s have ${d10s.length} left. Refilling...`);
		random.generateIntegers({ min: 1, max: 10, n: 100 }).then(function (result) {
			d10s = d10s.concat(result.random.data);
			console.log(`d10s now at ${d10s.length}.`);
		});
	}
}

function nwodRoll(pool, options='') {
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
		outcome.errors.push("Pool must be a number");
	}

	if (isNaN(outcome.again)) {
		outcome.errors.push("Exploding dice value must be a number")
	} else if (outcome.again < 8) {
		outcome.errors.push("Exploding dice may not be below 8");
	}
	
	if (outcome.pool > 25) {
		outcome.errors.push("Cannot roll more than 25 dice");
	}

	if (outcome.errors.length) {
		return outcome;
	}

	if (pool < 1) {
		var result = null;
		while (true) {
			result = d10();

			outcome.results.push(result);

			if (result != 10) {
				break;
			}

			outcome.successes++;
		}

		d10RefillCheck();

		return outcome;
	}

	for (i = 0; i < pool; i++) {
		var free_rerolls = rote ? 1 : 0; // will start out 0 if rote action isn't enabled
		do {
			var result = d10();
			if (result >= 8) {
				outcome.successes++;
			} else if (result == 1 && botching) {
				outcome.successes--;
			}
			outcome.results.push(result);
		} while (result >= outcome.again || free_rerolls-- > 0);
	}

	d10RefillCheck();
	
	return outcome;
}

function suxxToWords(suxx) {
	return suxx
	  ? suxx + " success" + (suxx == 1 ? '' : 'es')
	  : 'No success';
}

function againToWords(again) {
	return again == 10
	  ? ''
	  : (again < 10 ? " (" + again + "-Again)" : " (No rerolls)");
}

function nwodToText(outcome) {
	if (outcome.errors.length > 0) {
		return "Fate cannot adjuciate your request because: " + outcome.errors.join("; ");
	} else if (outcome.pool < 1) {
		return `Rolling a chance die with ${suxxToWords(outcome.successes)}. _Individual results:_ ${outcome.results.join(', ')}`;
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
		notes.push(outcome.again + "-Again");
	}
	if (outcome.botching) {
		notes.push("Ones Botch");
	}
	if (outcome.rote) {
		notes.push("Rote Action");
	}
	if (outcome.again == 11) {
		notes.push("No Rerolls");
	}

	return `Rolling ${outcome.pool}${notes.length > 0 ? ' (' + notes.join(", ") + ')' : ''}; ${suxxToWords(outcome.successes)}. _Individual results:_ ${newResults.join(', ')}`;
}

function generateTableContent(initTable) {
	var ret = "**Initiative Table**\n\n```\n";

	var chars = initTable.characters;

	var keys = Object.keys(chars);
	keys.sort(function (a, b) { return chars[b] - chars[a] });

	var padLength = chars[keys[0]].toString().length;

	for (const charIndex in keys) {
		charName = keys[charIndex];
		var forcesText = (initTable.forces[charName] ? " (forced by " + initTable.forces[charName] + ")" : "");
		ret += chars[charName].toString().padStart(padLength) + " : " + charName + forcesText + "\n";
	}

	ret += "```";

	return ret;
}

function nwodInitForceToText(msg, val, name) {
	if (!/^\d+$/.test(val)) {
		msg.reply("Can only force the init table if given a number");
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

	var tableContent = generateTableContent(initTables[channelId]);
	if (initTables[channelId].msg) {
		initTables[channelId].msg.delete();
	}

	msg.channel.send(tableContent).then(function(tableMsg) {
		initTables[channelId].msg = tableMsg;
	});
	
}

function nwodInitToText(msg, offset, name) {
	if (!/^\d+$/.test(offset)) {
		offset = 0;
	} else {
		offset = Number(offset);
	}

	if (!name) {
		name = msg.member ? msg.member.nickname : msg.author.username;
	}


	var roll = d10();
	var channelId = msg["channel"].id;
	var content = `Rolling initiative for ${name}: ${roll} (roll outcome) + ${offset} = ${roll + offset}`;
	msg.reply(content).then(function (notificationMsg) {
		if (!initTables[channelId]) {
			initTables[channelId] = { characters: {}, forces: {} };
		}

		initTables[channelId].characters[name] = roll + offset;

		var tableContent = generateTableContent(initTables[channelId]);
		if (initTables[channelId].msg) {
			initTables[channelId].msg.delete();
		}

		msg.channel.send(tableContent).then(function(tableMsg) {
			initTables[channelId].msg = tableMsg;
		});
	});
}

function nwodInitClear(msg) {
	var channelId = msg["channel"].id;
	msg.reply("Cleared initiative table");
	initTables[channelId] = { characters: {}, forces: {} };
}

function on_ready(client) {
	console.log(` logged in as ${this.user.tag}!`);
}


function wcRem(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("This command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("Only administrators may use this command.");
		return;
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply("Channel does not exist on this server");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	if (wc[guild.id].listen_channels.includes(channel_id)) {
		wc[guild.id].listen_channels = wc[guild.id].listen_channels.filter(function (val, ind) {
			return val != channel_id;
		});
		msg.reply("The channel " + channel.name + " has been removed.");

		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	} else {
		msg.reply("The channel " + channel.name + " isn't in the wordcount list");
	}
}

function wcAdd(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("only administrators may use this command.");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply("channel does not exist on this server");
		return;
	}

	if (wc[guild.id].listen_channels.includes(channel_id)) {
		msg.reply("That channel is already added.");
	} else {
		wc[guild.id].listen_channels.push(channel_id);
		msg.reply("Added " + channel.name);
		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	}
}

function wcList(msg) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("This command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("Only administrators may use this command.");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channels = guild.channels.cache.filter(chan => wc[guild.id].listen_channels.includes(chan.id)).array();

	if (channels.length == 0) {
		msg.reply("This server has no wordcount channels.");
		return;
	}

	var reply = "The wordcount channels are:\n\n";

	for (i = 0; i < channels.length; i++) {
		reply += channels[i].name + "\n";
	}

	msg.reply(reply);
}

function wcOOC(msg, channel_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("only administrators may use this command.");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null };
	}

	var channel = guild.channels.cache.find(chan => chan.id == channel_id);

	if (channel == null) {
		msg.reply("channel does not exist on this server");
		return;
	}

	wc[guild.id].ooc_channel = channel.id;

	msg.reply("OOC award channel set to " + channel.name);
}

function wordCount(prose) {
	let length = prose.match(/[\w'’]+/gi);
	length = length == null ? 0 : length.length;
	return length;
}

function wcRA(msg, role_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("only administrators may use this command.");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null, "roles" : [] };
	}
	
	guild.roles.fetch(role_id).then(role => {
		if (role == null) {
			msg.reply("role does not exist on this server");
			return;
		}
	
		if (wc[guild.id].roles == null) {
			wc[guild.id].roles = [];
		}
	
		if (wc[guild.id].roles.includes(role_id)) {
			msg.reply("That role is already added.");
		} else {
			wc[guild.id].roles.push(role_id);
			msg.reply("Added " + role.name);
			fs.writeFile('wc.json', JSON.stringify(wc), function () {});
		}
	});
}

function wcRR(msg, role_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("only administrators may use this command.");
		return;
	}

	if (wc[guild.id] == null) {
		wc[guild.id] = { "listen_channels" : [], "ooc_channel" : null, "roles" : [] };
	}
	
	guild.roles.fetch(role_id).then(role => {
		wc[guild.id].roles = wc[guild.id].roles.filter(function (val, ind) { return val != role_id });

		msg.reply("Removed role " + (role ? role.name : role_id) + ".");

		fs.writeFile('wc.json', JSON.stringify(wc), function () {});
	});

}
function wordCountConsider(msg) {
	var guild = msg.guild;
	if (guild == null) {
		return;
	}

	var channel = msg.channel;

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
		ooc_channel.send(msg.author.toString() + " wrote a post with " + wordCountCalc + " words, earning " + reward + " Bonus Points. This user's total is now " + wc[guild.id].users[msg.author.id].bonus_points + ".");
		wc[guild.id].users[msg.author.id].last_sent = now + 3600;
	}
	
	fs.writeFile('wc.json', JSON.stringify(wc), function () {});
}

function wcForce(msg, user_id, bp_total, wc_total) {
	if (user_id == null || isNaN(user_id)) {
		msg.reply("You must specify the user whose total you are forcing.");
		return;
	}

	if (bp_total == null || isNaN(bp_total) ) {
		msg.reply("Must submit a bonus point total, and it must be a number");
		return;
	}

	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
		return;
	}

	if (!isAdmin(msg.member)) {
		msg.reply("only administrators may use this command.");
		return;
	}

	var user = guild.members.cache.array().filter(member => member.user.id == user_id)[0];

	if (user == null) {
		msg.reply("that user isn't on this server.");
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

	msg.reply(user.toString() + " now has " + wc[guild.id].users[user.id].bonus_points + " Bonus Points and a word count cache of " + wc[guild.id].users[user.id].word_count + ".")

	fs.writeFile('wc.json', JSON.stringify(wc), function () {});
}

function wcShow(msg, user_id) {
	var guild = msg.guild;
	if (guild == null) {
		msg.reply("this command must be used in a guild.");
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

	msg.reply(user.toString() + " has " + wc[guild.id].users[user.id].bonus_points + " Bonus Points and is " + wc[guild.id].users[user.id].word_count + " words toward their next one.");
}

function handle_message(msg) {
	const words = msg.content.split(/\s+/);
	const command = words[0].toLowerCase();

	switch (command) {
		case '!nwod':
			const outcome = nwodToText(nwodRoll(words[1], words[2]));
			console.log(`New nWoD dice roll from ${msg.author.username}#${msg.author.discriminator}. Outcome: ${outcome}`);
			msg.reply(outcome);
			break;
		case '!init':
			nwodInitToText(msg, words[1], words[2]);
			break;
		case '!initforce':
			nwodInitForceToText(msg, words[1], words[2]);
			break;
		case '!initclear':
			nwodInitClear(msg);
			break;
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
	}

	wordCountConsider(msg);
}

var clients = [];

for (const token of auth.token) {
	const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
	process.stdout.write("Logging in now...");
	client.on('message', handle_message);
	client.on('ready', on_ready);
	client.login(token);
}

d10RefillCheck();

initTables = {};

var minute = 1000 * 60;

setInterval(function () {
	if (d10sold == d10s) {
		return;
	}

	fs.writeFileSync('stored_results.json', JSON.stringify(d10s));

	d10sold = d10s;

	console.log("Updating stored results");
}, minute);
