const { EmbedBuilder } = require("discord.js");
const PlayerUtils = require("../../player.js");
const musicIcons = require("../../Emojis/Music.js");

// Fix for fetch not being available
const fetch = require('node-fetch');
global.fetch = fetch;

// Import spotify-url-info functions
const { getData, getTracks } = require('spotify-url-info')(fetch);

const requesters = new Map();

module.exports = {
    name: "play",
    aliases: ["p"],
    description: "Play a song or playlist (supports Spotify links)",
    usage: "play <song name/URL/Spotify link>",
    voiceChannel: true,

    async execute(message, args, client) {
        if (message.deletable) message.delete().catch(() => { });

        const query = args.join(" ");

        if (!query) {
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Missing Query")
                .setDescription("Please provide a song name, URL, or Spotify link to play!")
                .addFields({
                    name: "Examples",
                    value: "``````"
                })
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            return message.reply({ embeds: [errorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
        }

        if (!message.member.voice.channel) {
            const voiceErrorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Voice Channel Required")
                .setDescription("You need to be in a voice channel to play music!")
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            return message.reply({ embeds: [voiceErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
        }

        const permissions = message.member.voice.channel.permissionsFor(message.guild.members.me);
        if (!permissions.has(["Connect", "Speak"])) {
            const permErrorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Missing Permissions")
                .setDescription("I don't have permission to connect or speak in your voice channel!")
                .addFields({
                    name: "Required Permissions",
                    value: "• Connect\n• Speak\n• Use Voice Activity"
                })
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            return message.reply({ embeds: [permErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
        }

        const searchingEmbed = new EmbedBuilder()
            .setColor("#ffcc00")
            .setTitle("Searching...")
            .setDescription(`Looking for: **${query}**`)
            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        const searchMessage = await message.channel.send({ embeds: [searchingEmbed] });

        let player = client.riffy.players.get(message.guild.id);

        if (!player) {
            player = PlayerUtils.createPlayer(client, message);
            if (!player) {
                const playerErrorEmbed = new EmbedBuilder()
                    .setColor("#ff0000")
                    .setTitle("Player Error")
                    .setDescription("Failed to create music player! Please try again.")
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return searchMessage.edit({ embeds: [playerErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
            }
        }

        try {
            // Handle Spotify URLs
            if (query.includes('spotify.com')) {
                if (query.includes('/playlist/') || query.includes('/album/')) {
                    return await this.handleSpotifyPlaylist(query, player, message, searchMessage, client);
                } else if (query.includes('/track/')) {
                    return await this.handleSpotifyTrack(query, player, message, searchMessage, client);
                }
            }

            // Handle regular YouTube/SoundCloud URLs and search queries
            const resolve = await PlayerUtils.searchTrack(client, query, message.author);

            if (!resolve) {
                const noResultsEmbed = new EmbedBuilder()
                    .setColor("#ff0000")
                    .setTitle("Search Failed")
                    .setDescription("Failed to search for the track! Please try again.")
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return searchMessage.edit({ embeds: [noResultsEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
            }

            const { loadType, tracks, playlistInfo } = resolve;

            switch (loadType) {
                case 'playlist':
                    await this.handlePlaylistEmbed(player, tracks, playlistInfo, message, searchMessage);
                    break;

                case 'search':
                case 'track':
                    if (tracks.length === 0) {
                        const noTracksEmbed = new EmbedBuilder()
                            .setColor("#ff0000")
                            .setTitle("No Results")
                            .setDescription(`No tracks found for: **${query}**`)
                            .addFields({
                                name: "Try",
                                value: "• Different search terms\n• Artist name + song title\n• Direct YouTube/Spotify URL"
                            })
                            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                            .setTimestamp();

                        return searchMessage.edit({ embeds: [noTracksEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
                    }
                    const track = tracks[0];
                    await this.handleTrackEmbed(player, track, message, searchMessage);
                    break;

                default:
                    const defaultErrorEmbed = new EmbedBuilder()
                        .setColor("#ff0000")
                        .setTitle("No Results")
                        .setDescription(`No results found for: **${query}**`)
                        .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                        .setTimestamp();

                    return searchMessage.edit({ embeds: [defaultErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
            }

            if (!player.playing && !player.paused) player.play();

        } catch (error) {
            console.error("Play command error:", error);
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Unexpected Error")
                .setDescription("An error occurred while processing your request.")
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            searchMessage.edit({ embeds: [errorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
        }
    },

    // Helper function to safely extract artist names
    extractArtistNames(trackData) {
        try {
            if (trackData.artists && Array.isArray(trackData.artists) && trackData.artists.length > 0) {
                return trackData.artists.map(a => a && a.name ? a.name : 'Unknown Artist').join(', ');
            } else if (trackData.artist && typeof trackData.artist === 'string') {
                return trackData.artist;
            } else if (trackData.author && typeof trackData.author === 'string') {
                return trackData.author;
            }
            return 'Unknown Artist';
        } catch (error) {
            console.error('Error extracting artist names:', error);
            return 'Unknown Artist';
        }
    },

    // Helper function to safely extract track name
    extractTrackName(trackData) {
        try {
            return trackData.name || trackData.title || 'Unknown Title';
        } catch (error) {
            console.error('Error extracting track name:', error);
            return 'Unknown Title';
        }
    },

    async handleSpotifyTrack(query, player, message, searchMessage, client) {
        try {
            const spotifyData = await getData(query);
            let trackName;

            const title = this.extractTrackName(spotifyData);
            const artist = this.extractArtistNames(spotifyData);
            trackName = `${title} - ${artist}`;

            const resolve = await PlayerUtils.searchTrack(client, trackName, message.author);
            if (resolve && resolve.tracks && resolve.tracks.length > 0) {
                const track = resolve.tracks[0];
                await this.handleTrackEmbed(player, track, message, searchMessage);
                if (!player.playing && !player.paused) player.play();
            } else {
                throw new Error('No YouTube results found');
            }
        } catch (err) {
            console.error('Error handling Spotify track:', err);
            const spotifyErrorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Spotify Track Error")
                .setDescription("Failed to load the Spotify track! The link might be invalid or private.")
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            return searchMessage.edit({ embeds: [spotifyErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
        }
    },

    async handleSpotifyPlaylist(query, player, message, searchMessage, client) {
        try {
            // Update embed to show we're processing Spotify playlist
            const processingEmbed = new EmbedBuilder()
                .setColor("#1DB954")
                .setTitle("🎵 Processing Spotify Playlist...")
                .setDescription("Loading tracks and finding the first song to play...")
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await searchMessage.edit({ embeds: [processingEmbed] });

            // Get playlist data and tracks with better error handling
            let playlistData, tracksData;

            try {
                [playlistData, tracksData] = await Promise.all([
                    getData(query).catch(() => ({ title: "Spotify Playlist", name: "Spotify Playlist", image: null })),
                    getTracks(query).catch(() => [])
                ]);
            } catch (error) {
                console.error('Error getting Spotify data:', error);
                throw new Error('Failed to fetch Spotify data');
            }

            if (!tracksData || tracksData.length === 0) {
                const noTracksEmbed = new EmbedBuilder()
                    .setColor("#ff0000")
                    .setTitle("Playlist Error")
                    .setDescription("Could not load tracks from this Spotify playlist. It might be private, invalid, or empty.")
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return searchMessage.edit({ embeds: [noTracksEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 3000));
            }

            //console.log(`Processing Spotify playlist with ${tracksData.length} tracks`);

            const playlistInfo = {
                name: playlistData.title || playlistData.name || "Spotify Playlist",
                thumbnail: playlistData.image || playlistData.thumbnail
            };

          
            const firstTrackData = tracksData[0];
            if (!firstTrackData) {
                throw new Error('No first track data available');
            }

            const firstTrackTitle = this.extractTrackName(firstTrackData);
            const firstTrackArtist = this.extractArtistNames(firstTrackData);
            const firstTrackName = `${firstTrackTitle} - ${firstTrackArtist}`;

            //console.log(`Searching for first track: ${firstTrackName}`);

            const firstTrackResolve = await PlayerUtils.searchTrack(client, firstTrackName, message.author);
            if (firstTrackResolve && firstTrackResolve.tracks && firstTrackResolve.tracks.length > 0) {
                const firstTrack = firstTrackResolve.tracks[0];
                firstTrack.info.requester = message.author;
                player.queue.add(firstTrack);
                requesters.set(firstTrack.info.uri, message.author.username);

                // Start playing the first track
                if (!player.playing && !player.paused) player.play();

                // Show initial embed with first track
                const initialEmbed = new EmbedBuilder()
                    .setColor("#1DB954")
                    .setAuthor({ name: "🎵 Spotify Playlist - First Track Playing", iconURL: musicIcons.correctIcon })
                    .setTitle(playlistInfo.name)
                    .setDescription(`**Now Playing:** ${firstTrackTitle} - ${firstTrackArtist}\n\n🔄 Loading remaining ${tracksData.length - 1} tracks in background...`)
                    .addFields(
                        { name: "Total Tracks", value: `${tracksData.length} songs`, inline: true },
                        { name: "Requested by", value: message.author.username, inline: true },
                        { name: "Status", value: "Playing first track", inline: true }
                    )
                    .setFooter({ text: "Other tracks are being added to queue in background", iconURL: message.guild.iconURL() })
                    .setTimestamp();

                if (playlistInfo.thumbnail) initialEmbed.setThumbnail(playlistInfo.thumbnail);

                await searchMessage.edit({ embeds: [initialEmbed] });

                // Process remaining tracks in background (non-blocking)
                if (tracksData.length > 1) {
                    this.processRemainingTracks(tracksData.slice(1), player, message, client, playlistInfo, searchMessage);
                } else {
                    // If only one track, show completion immediately
                    setTimeout(() => {
                        const singleTrackEmbed = new EmbedBuilder()
                            .setColor("#1DB954")
                            .setAuthor({ name: "✅ Spotify Playlist Complete", iconURL: musicIcons.correctIcon })
                            .setTitle(playlistInfo.name)
                            .setDescription(`Successfully loaded **1/1** track!`)
                            .addFields(
                                { name: "Tracks Added", value: "1 song", inline: true },
                                { name: "Requested by", value: message.author.username, inline: true },
                                { name: "Status", value: "Complete", inline: true }
                            )
                            .setFooter({ text: "Spotify playlist processed", iconURL: message.guild.iconURL() })
                            .setTimestamp();

                        if (playlistInfo.thumbnail) singleTrackEmbed.setThumbnail(playlistInfo.thumbnail);

                        searchMessage.edit({ embeds: [singleTrackEmbed] }).then(msg =>
                            setTimeout(() => msg.delete().catch(() => { }), 8000)
                        );
                    }, 2000);
                }
            } else {
                throw new Error('Could not find first track on YouTube');
            }

        } catch (err) {
            console.error('Error handling Spotify playlist:', err);
            const playlistErrorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Playlist Error")
                .setDescription(`Failed to load the Spotify playlist: ${err.message || 'Unknown error'}`)
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            return searchMessage.edit({ embeds: [playlistErrorEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 5000));
        }
    },

    async processRemainingTracks(tracksData, player, message, client, playlistInfo, searchMessage) {
        let addedCount = 1; // First track already added
        const totalTracks = tracksData.length + 1; // +1 for first track
        let processedCount = 0;

        //console.log(`Processing ${tracksData.length} remaining tracks...`);

        // Process tracks in smaller batches with optimized timing
        const batchSize = 5;
        const batchDelay = 50; // Reduced delay for faster processing

        for (let i = 0; i < tracksData.length; i += batchSize) {
            const batch = tracksData.slice(i, i + batchSize);

            const batchPromises = batch.map(async (trackData, index) => {
                try {
                    if (!trackData) {
                        //console.log(`Skipping undefined track at index ${i + index}`);
                        return;
                    }

                    const trackTitle = this.extractTrackName(trackData);
                    const trackArtist = this.extractArtistNames(trackData);

                    if (trackTitle === 'Unknown Title' && trackArtist === 'Unknown Artist') {
                        //console.log(`Skipping track with no valid data at index ${i + index}`);
                        return;
                    }

                    const trackName = `${trackTitle} - ${trackArtist}`;
                    const resolve = await PlayerUtils.searchTrack(client, trackName, message.author);

                    if (resolve && resolve.tracks && resolve.tracks.length > 0) {
                        const track = resolve.tracks[0];
                        track.info.requester = message.author;
                        player.queue.add(track);
                        requesters.set(track.info.uri, message.author.username);
                        addedCount++;
                        //console.log(`Added track ${addedCount - 1}/${totalTracks - 1}: ${trackTitle}`);
                    } else {
                        //console.log(`Could not find YouTube match for: ${trackName}`);
                    }
                    processedCount++;
                } catch (error) {
                    console.error(`Error adding track ${i + index}:`, error);
                    processedCount++;
                }
            });

            // Wait for current batch to complete
            await Promise.all(batchPromises);

            // Small delay between batches to prevent rate limiting
            if (i + batchSize < tracksData.length) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }

            // Update progress every few batches
            if ((i + batchSize) % (batchSize * 3) === 0 || i + batchSize >= tracksData.length) {
                const progress = Math.round((processedCount / tracksData.length) * 100);
                //console.log(`Progress: ${progress}% (${processedCount}/${tracksData.length} processed, ${addedCount}/${totalTracks} added)`);
            }
        }

        // Update final embed
        const queueTracks = player.queue.tracks || [];
        const totalDuration = queueTracks.reduce((total, track) => total + (track.info.length || 0), 0);

        const finalEmbed = new EmbedBuilder()
            .setColor("#1DB954")
            .setAuthor({ name: "✅ Spotify Playlist Fully Loaded", iconURL: musicIcons.correctIcon })
            .setTitle(playlistInfo.name)
            .setDescription(`Successfully added **${addedCount}/${totalTracks}** tracks to the queue!`)
            .addFields(
                { name: "Tracks Added", value: `${addedCount} songs`, inline: true },
                { name: "Total Duration", value: PlayerUtils.formatDuration(totalDuration), inline: true },
                { name: "Queue Size", value: `${player.queue.size || 0} songs`, inline: true },
                { name: "Requested by", value: message.author.username, inline: true },
                { name: "Volume", value: `${player.volume}%`, inline: true },
                { name: "Success Rate", value: `${Math.round((addedCount / totalTracks) * 100)}%`, inline: true }
            )
            .setFooter({ text: "Spotify playlist fully processed", iconURL: message.guild.iconURL() })
            .setTimestamp();


        if (playlistInfo.thumbnail) finalEmbed.setThumbnail(playlistInfo.thumbnail);

        // Update the message and delete after 10 seconds
        searchMessage.edit({ embeds: [finalEmbed] }).then(msg =>
            setTimeout(() => msg.delete().catch(() => { }), 10000)
        ).catch(console.error);

        //console.log(`Playlist processing complete: ${addedCount}/${totalTracks} tracks added successfully`);
    },

    async handlePlaylistEmbed(player, tracks, playlistInfo, message, searchMessage) {
        const addedTracks = [];
        for (const track of tracks) {
            track.info.requester = message.author;
            player.queue.add(track);
            requesters.set(track.info.uri, message.author.username);
            addedTracks.push(track);
        }

        const totalDuration = addedTracks.reduce((total, track) => total + (track.info.length || 0), 0);

        const playlistEmbed = new EmbedBuilder()
            .setColor("#00ff00")
            .setAuthor({ name: "Playlist Added to Queue", iconURL: musicIcons.correctIcon })
            .setTitle(playlistInfo.name || "Unknown Playlist")
            .setDescription(`Successfully added **${addedTracks.length}** tracks to the queue!`)
            .addFields(
                { name: "Tracks Added", value: `${addedTracks.length} songs`, inline: true },
                { name: "Total Duration", value: PlayerUtils.formatDuration(totalDuration), inline: true },
                { name: "Queue Position", value: `${player.queue.size - addedTracks.length + 1}-${player.queue.size}`, inline: true },
                { name: "Requested by", value: message.author.username, inline: true },
                { name: "Volume", value: `${player.volume}%`, inline: true },
                { name: "Queue Total", value: `${player.queue.size} songs`, inline: true }
            )
            .setFooter({ text: `${player.playing ? "Added to queue" : "Starting playback"}`, iconURL: message.guild.iconURL() })
            .setTimestamp();

        if (playlistInfo.thumbnail) playlistEmbed.setThumbnail(playlistInfo.thumbnail);

        const msg = await searchMessage.edit({ embeds: [playlistEmbed] });
        setTimeout(() => msg.delete().catch(() => { }), 5000);
    },

    async handleTrackEmbed(player, track, message, searchMessage) {
        track.info.requester = message.author;
        const queuePosition = player.queue.size + 1;
        player.queue.add(track);
        requesters.set(track.info.uri, message.author.username);

        const isPlaying = player.playing || player.paused;

        const trackEmbed = new EmbedBuilder()
            .setColor(isPlaying ? "#00ff00" : "#0099ff")
            .setAuthor({ name: isPlaying ? "Added to Queue" : "Now Playing", iconURL: musicIcons.correctIcon })
            .setTitle(track.info.title)
            .setURL(track.info.uri)
            .setDescription(`**${track.info.author}**`)
            .addFields(
                { name: "Duration", value: PlayerUtils.formatDuration(track.info.length), inline: true },
                { name: "Requested by", value: message.author.username, inline: true },
                { name: "Position", value: isPlaying ? `${queuePosition} in queue` : "Now Playing", inline: true }
            );

        if (isPlaying) {
            const estimatedTime = player.queue.slice(0, queuePosition - 1)
                .reduce((total, t) => total + (t.info.length || 0), 0) +
                (player.current ? (player.current.info.length - player.position) : 0);

            trackEmbed.addFields(
                { name: "Estimated Wait", value: PlayerUtils.formatDuration(estimatedTime), inline: true },
                { name: "Volume", value: `${player.volume}%`, inline: true },
                { name: "Queue Size", value: `${player.queue.size} songs`, inline: true }
            );
        } else {
            trackEmbed.addFields(
                { name: "Volume", value: `${player.volume}%`, inline: true },
                { name: "Status", value: "Starting playback...", inline: true }
            );
        }

        if (track.info.thumbnail) trackEmbed.setThumbnail(track.info.thumbnail);

        trackEmbed.setFooter({ text: `Powered by ${track.info.sourceName || "Music Bot"}`, iconURL: message.guild.iconURL() }).setTimestamp();

        const msg = await searchMessage.edit({ embeds: [trackEmbed] });
        setTimeout(() => msg.delete().catch(() => { }), 5000);
    },

    requesters: requesters,
};
