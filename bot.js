console.log("Lady Luck");
console.log("A Discord dicebot with rules ad hoceries");
console.log("The Stranjer\n\n");

const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');
const RandomOrg = require('random-org');

var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'));
var random = new RandomOrg({ apiKey: auth.random });

var d10s = [];

function randInt(min, max) {
	return min + Math.round(Math.random() * (max - min));
}

function d10() {
	ret = d10s.pop();
	if (typeof(ret) == 'undefined') {
		return randInt(1, 10);
	} else {
		return ret;
	}
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

function nwodRoll(pool, again) {
	var outcome = {
		errors: [],
		successes: 0,
		results: [],
		again: again == null ? 10 : parseInt(again),
		pool: parseInt(pool)
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

	if (outcome.errors.length > 0) {
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
		do {
			var result = d10();
			if (result >= 8) {
				outcome.successes++;
			}
			outcome.results.push(result);
		} while (result >= outcome.again);
	}

	d10RefillCheck();
	
	return outcome;
}

function suxxToWords(suxx) {
	if (suxx == 1) {
		return "1 success";
	} else {
		return `${suxx == 0 ? 'No' : suxx} successes`;
	}
}

function againToWords(again) {
	if (again == 10) {
		return '';
	} else if (again < 10) {
		return ` (${again}-Again)`;
	} else {
		return " (No rerolls)";
	}
}

function nwodToText(outcome) {
	if (outcome.errors.length > 0) {
		return "Fate cannot adjuciate your request because: " + outcome.errors.join("; ");
	}

	if (outcome.pool < 1) {
		return `Rolling a chance die with ${suxxToWords(outcome.successes)}. _Individual results:_ ${outcome.results.join(', ')}`;
	}

	var newResults = outcome.results;

	for (var i = 0; i < newResults.length; i++) {
		var mode = "fail";
		if (newResults[i] >= outcome.again) {
			mode = "explode";
		} else if (newResults[i] >= 8) {
			mode = "success";
		}
	
	 emojiName = "d10" + mode + "_" + newResults[i];
	
	 newResults[i] = diceViews[emojiName];
	}


	return `Rolling ${outcome.pool}${againToWords(outcome.again)}; ${suxxToWords(outcome.successes)}. _Individual results:_ ${newResults.join(', ')}`;
}

function padStart(str, len, val) {
	while (str.length < len) {
	 str = val + str;
	}
	return str;
};

function generateTableContent(initTable) {
	var ret = "**Initiative Table**\n\n```\n";

	var chars = initTable.characters;

	var keys = Object.keys(chars);
	keys.sort(function (a, b) { return chars[b] - chars[a] });

	var padLength = chars[keys[0]].toString().length;

	keys.forEach(function(charName) {
		var forcesText = (initTable.forces[charName] ? " (forced by " + initTable.forces[charName] + ")" : "");
		ret += padStart(chars[charName].toString(), padLength, " ") + " : " + charName + forcesText + "\n";
	});

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

client.on('ready', () => {
	console.log(` logged in as ${client.user.tag}!`);


	for (i = 1; i <= 7; i++) {
		emoji = client.emojis.find(emoji => emoji.name == "d10fail_" + i);
		if (emoji) {
			diceViews["d10fail_" + i] = emoji;
		} else {
			diceViews["d10fail_" + i] = "" + i;
		}
	}

	for (i = 8; i <= 10; i++) {
		emojiExplode = client.emojis.find(emoji => emoji.name == "d10explode_" + i);
		if (emojiExplode) {
			diceViews["d10explode_" + i] = emojiExplode;
		} else {
			diceViews["d10explode_" + i] = "**_" + i + "_**";
		}

		emojiSuccess = client.emojis.find(emoji => emoji.name == "d10success_" + i);
		if (emojiSuccess) {
			diceViews["d10success_" + i] = emojiSuccess;
		} else {
			diceViews["d10success_" + i] = "**" + i + "**";
		}
	}
});

client.on('message', msg => {
	words = msg.content.split(/\s+/);
	command = words[0].toLowerCase();
	if (command === '!nwod') {
		var outcome = nwodToText(nwodRoll(words[1], words[2]));
		console.log(`New nWoD dice roll from ${msg.author.username}#${msg.author.discriminator}. Outcome: ${outcome}`)
		msg.reply(outcome);
	} else if (command == "!init") {
		nwodInitToText(msg, words[1], words[2]);
	} else if (command === "!initforce") {
		nwodInitForceToText(msg, words[1], words[2]);
	} else if (command === "!initclear") {
		nwodInitClear(msg);
	}
});


d10RefillCheck();
process.stdout.write("Logging in now...");
client.login(auth.token);

diceViews = {};
initTables = {};

