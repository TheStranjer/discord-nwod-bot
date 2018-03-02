console.log("Lady Luck");
console.log("A Discord dicebot with rules ad hoceries");
console.log("The Stranjer\n\n");

const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');

function randInt(min, max) {
  return min + Math.round(Math.random() * (max - min));
}

function d10() {
  return randInt(1, 10);
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
    if (newResults[i] >= 8) {
      newResults[i] = `**${newResults[i]}**`;
    } else {
      newResults[i] = newResults[i].toString();
    }
  }

  return `Rolling ${outcome.pool}${againToWords(outcome.again)}; ${suxxToWords(outcome.successes)}. _Individual results:_ ${newResults.join(', ')}`;
}

client.on('ready', () => {
  console.log(` logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  words = msg.content.split(/\s+/);
  command = words[0].toLowerCase();
  if (command === '!nwod') {
    var outcome = nwodToText(nwodRoll(words[1], words[2]));
    console.log(`New nWoD dice roll from ${msg.author.username}#${msg.author.discriminator}. Outcome: ${outcome}`)
    msg.reply(outcome);
  }
});

var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'));

process.stdout.write("Logging in now...");
client.login(auth.token);
