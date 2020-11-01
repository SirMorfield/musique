const tokens = require('./musiqueTokens.json')
const searchOpts = {
	maxResults: 10,
	key: tokens["youtube-search"].token,
	safeSearch: 'none'
}
const token = tokens["discord.js"].token
const prefix = '!'

const Discord = require('discord.js')
const client = new Discord.Client()
client.once('reconnecting', () => { console.log('reconnecting') })
client.once('disconnect', () => { console.log('disconnect') })
client.once('ready', () => { console.log('ready') })

const search = require('youtube-search')
const ytdl = require('ytdl-core-discord')

const AllHtmlEntities = require('html-entities').AllHtmlEntities
const entities = new AllHtmlEntities();

let queue = { songs: [], wasSkipped: false }

client.on('message', async message => {
	if (!isValidRequest(message)) return

	const parsed = await parseMessage(message.content)
	if (parsed === undefined) return
	if (parsed.error) message.channel.send(parsed.error)

	switch (parsed.command) {
		case 'play':
			play(parsed.song, message.channel, message.member.voice.channel, false)
			break;

		case 'skip':
			skip()
			break;
		case 'queue':
			displayQueue(message.channel)
			break;
		case 'leave':
			leave()
			break;
	}

})

function leave() {
	if (queue.voiceChannel)
		queue.voiceChannel.leave()
}

function isValidRequest(message) {
	// if (message.author.bot) return false

	if (!message.member.voice.channel) {
		// message.channel.send('You need to be in a voice channel to play music')
		return false
	}

	const permissions = message.member.voice.channel.permissionsFor(message.client.user)
	if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
		message.channel.send('Permission error')
		return false
	}

	return true
}

async function parseMessage(content) {
	content = content.trim()
	if (content[0] !== prefix) return undefined

	let cmd = content.split(' ')[0]
	cmd = cmd.toLowerCase()

	if (cmd == `${prefix}p` || cmd == `${prefix}play`) {
		const rest = content.substring(cmd.length + 1)
		if (rest.length == 0) return undefined

		if (/https{0,}\:\/\/www\.youtu/.test(rest)) {
			return {
				command: 'play',
				song: {
					title: 'direct link',
					url: rest
				}
			}
		} else {
			let results
			try {
				results = (await search(rest, searchOpts)).results
			} catch (err) { return { error: `YouTube API error` } }

			results = results.filter(result => result.kind === 'youtube#video')
			if (results.length == 0) return { error: 'Not found' }

			return {
				command: 'play',
				song: {
					title: entities.decode(results[0].title),
					url: results[0].link
				}
			}
		}
	}
	else if (cmd == `${prefix}s` || cmd == `${prefix}skip`) return { command: 'skip' }
	else if (cmd == `${prefix}q` || cmd == `${prefix}que` || cmd == `${prefix}queue`) return { command: 'queue' }
	else if (cmd == `${prefix}l` || cmd == `${prefix}leave` || cmd == `${prefix}quit` || cmd == `${prefix}disconnect` || cmd == `${prefix}exit`) return { command: 'leave' }
	// else if (command == `${prefix}d` || `${prefix}delete`) command = 'delete'
	else return undefined
}

function playNextInQueue() {
	queue.songs.shift()
	if (queue.songs.length > 0) play(queue.songs[0], null, null, true)
}

let leaveTimeout
async function play(song, textChannel, voiceChannel, playingFromQueue) {
	// serverQueue.voiceChannel.leave()

	if (textChannel) queue.textChannel = textChannel
	if (voiceChannel) queue.voiceChannel = voiceChannel

	if (queue.connected && queue.songs.length > 0 && !playingFromQueue) {
		queue.songs.push(song)
		queue.textChannel.send(`\`${song.title}\` added to queue \n${song.url}`)
		return
	}

	try {
		const connection = await queue.voiceChannel.join()
		const stream = await ytdl(song.url)
		const dispatcher = connection.play(stream, { type: 'opus' })

		clearTimeout(leaveTimeout)
		dispatcher.on('finish', () => {
			if (!queue.wasSkipped) playNextInQueue()
			queue.wasSkipped = false

			clearTimeout(leaveTimeout)
			leaveTimeout = setTimeout(() => {
				queue.voiceChannel.leave()
				queue.songs = []
			}, 4.5 * 60 * 1000)
		})
		dispatcher.on('error', console.error)

		if (!playingFromQueue) queue.songs.push(song)


		queue.connected = true
		queue.connection = connection
		queue.dispatcher = dispatcher

		let str = `Playing \`${song.title}\``
		if (playingFromQueue) str += ' from queue'
		else str += `\n${song.url}`
		queue.textChannel.send(str)
	} catch (err) {
		console.error(err)
		return queue.textChannel.send('Internal (╯°□°）╯︵ ┻━┻ error')
	}
}

function skip() {
	if (!queue.connected) return
	queue.wasSkipped = true
	queue.dispatcher.end()
	playNextInQueue()
}

function displayQueue(textChannel) {
	const len = queue.songs.length
	if (len == 0) {
		textChannel.send('Queue is empty')
		return
	}
	let str = `Now playing:\n\`${queue.songs[0].title}\`\n`
	if (len == 1) str += '0 songs in queue'
	else if (len == 2) str += `1 song in queue:\n\`${queue.songs[1].title}\``
	else if (len > 2) {
		str += `${len - 1} songs in queue\n`
		for (let i = 1; i < len; i++) {
			str += `${i}: \`${queue.songs[i].title}\`\n`
			// str += '\n'
		}
	}
	str.replace(/\n$/m, '')
	textChannel.send(str)
}


client.login(token)
