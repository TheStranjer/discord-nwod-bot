console.log("Lady Luck");
console.log("A Discord dicebot with rules ad hoceries");
console.log("The Stranjer\n\n");

const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');

client.on('ready', () => {
  console.log(` logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if (msg.content === '/g') {
    msg.reply('pong');
  }
});

var auth = JSON.parse(fs.readFileSync('auth.json', 'utf8'));

process.stdout.write("Logging in now...");
client.login(auth.token);
