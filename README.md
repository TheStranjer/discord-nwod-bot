# Discord nWoD / CofD bot

Lady Luck is a bot that rolls ten sided dice and counts successes by the New World of Darkness / Chronicles of Darkness rules: 8, 9, and 10 is a "success" while 10s reroll. Optionally 9s or 8s can reroll, or you can opt for no rerolls.

Lady Luck uses random.org's random numbers, which means it's authentically random, or as close to that as we're going to get in computing.

# Using

Here are some examples for using the commands of this bot

## Rolling Dice

To roll 7 dice:
`!nwod 7`

To roll 7 dice, with 8-Again:
`!nwod 7 8`

To roll 7 dice, with no rerolls:
`!nwod 7 n`

To roll with rote action:
`!nwod 7 r`

To roll with botching:
`!nwod 7 b`

You can combine any of the options aside from the Again rules. For example, to roll with 8-Again and botching:
`!nwod 7 8b`

## Initiative Rolls

To roll initiative:
`!init <mod> <name>`
`!init 7 Joe`

To force initiative to a certain value:
`!initforce <value> <name>`
`!initforce 13 Joe`

To clear the initiative table:
`!initclear`

## Word Counter / Bonus Point counter

To add an in-character channel:
`!wc-add <channel-id>`
`!wc-add 704140585883140186`

To remove an in-character channel:
`!wc-rem <channel-id>`
`!wc-rem 704140585883140186`

To set the OOC Bonus Point channel that it tells users when they get Bonus Points:
`!wc-ooc <channel-id>`
`!wc-ooc 585883140186704140`

To add a user role who may get Bonus Points by posting in character:
`!wc-ra <user-role-id>`
`!wc-ra 8314018670414058583`

To remove a user role who may get Bonus Points by posting in character:
`!wc-rr <user-role-id>`
`!wc-rr 6704140585838314018`

To list the in-character word count channels:
`!wc-list`

To force the Bonus Point and Word Count totals:
`!wc-force <user-id> <bonus-point-total> [<word-count-total>]`
`!wc-force 136786521398494975 123`
`!wc-force 136786521398494975 123 456`

To show your or another user's Word Count and Bonus Point count:
`!wc [<user-id>]`
`!wc 652113678398494975`

# Inviting To Your Server

To invite this bot to _your_ server, just [click here](https://discordapp.com/oauth2/authorize?client_id=833128867282681887&permissions=2048&scope=bot).
